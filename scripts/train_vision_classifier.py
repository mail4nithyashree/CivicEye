import os
import sys
import json
import random
from PIL import Image
try:
    import pillow_avif
except Exception:
    pass

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as transforms
import torchvision.models as models
import onnx
import onnxruntime as ort
import numpy as np

# Set seeds for reproducibility
random.seed(42)
torch.manual_seed(42)
np.random.seed(42)

CLASSES = [
    "alligator_cracking",
    "cracking",
    "damaged_footpath",
    "damaged_traffic_sign",
    "debris_road_blockage",
    "manhole_defect",
    "pothole",
    "road_divider_damage",
    "street_light_fault",
    "unrelated_images",
    "valid_road_no_issue",
    "waterlogging"
]

CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}

# Unrelated subcategories mapped to unrelated_images
UNRELATED_SUBDIRS = [
    "unrelated_images",
    "animals",
    "buildings",
    "flowers_plants",
    "food_objects",
    "people",
    "random_non_road"
]

def gather_images(base_dir, is_train=True):
    samples = []
    for cls_name in CLASSES:
        if cls_name == "unrelated_images":
            subdirs = UNRELATED_SUBDIRS
        else:
            subdirs = [cls_name]
        
        for sub in subdirs:
            folder = os.path.join(base_dir, sub)
            if not os.path.exists(folder):
                continue
            for f in os.listdir(folder):
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif')):
                    samples.append((os.path.join(folder, f), CLASS_TO_IDX[cls_name]))
    return samples

class CivicDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        with Image.open(path) as img:
            img = img.convert('RGB')
        if self.transform:
            img = self.transform(img)
        return img, label

def main():
    print("=== Training CivicEye Vision Classifier (MobileNetV2 Transfer Learning) ===")
    
    train_samples = gather_images('AI/training_images', is_train=True)
    # Also add some unrelated images from test_images to ensure variety in unrelated training
    extra_unrelated = []
    for sub in ["animals", "buildings", "flowers_plants", "food_objects", "people", "random_non_road"]:
        folder = os.path.join('AI/test_images', sub)
        if os.path.exists(folder):
            files = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
            for f in files[:len(files)//2]:
                extra_unrelated.append((f, CLASS_TO_IDX["unrelated_images"]))
    train_samples.extend(extra_unrelated)
    
    test_samples = gather_images('AI/test_images', is_train=False)
    # Filter out samples that were used in training
    train_paths = set(s[0] for s in train_samples)
    test_samples = [s for s in test_samples if s[0] not in train_paths]
    
    print(f"Total training samples: {len(train_samples)}")
    print(f"Total test/validation samples: {len(test_samples)}")
    
    train_transform = transforms.Compose([
        transforms.Resize((240, 240)),
        transforms.RandomResizedCrop(224, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    train_dataset = CivicDataset(train_samples, transform=train_transform)
    test_dataset = CivicDataset(test_samples, transform=val_transform)
    
    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=16, shuffle=False)
    
    # Load pretrained MobileNetV2
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    
    # Unfreeze the last few feature blocks to learn domain-specific road textures
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.features[-4:].parameters():
        param.requires_grad = True
        
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(model.last_channel, len(CLASSES))
    )
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    model = model.to(device)
    
    # Loss & Optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW([
        {'params': model.features[-4:].parameters(), 'lr': 1e-4},
        {'params': model.classifier.parameters(), 'lr': 1e-3}
    ], weight_decay=1e-4)
    
    epochs = 15
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    
    best_acc = 0.0
    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * imgs.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
            
        scheduler.step()
        train_loss = running_loss / total
        train_acc = correct / total
        
        # Eval
        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for imgs, labels in test_loader:
                imgs, labels = imgs.to(device), labels.to(device)
                outputs = model(imgs)
                _, preds = torch.max(outputs, 1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)
        val_acc = val_correct / val_total if val_total > 0 else 0
        
        if epoch % 5 == 0 or epoch == epochs:
            print(f"Epoch {epoch:2d}/{epochs:2d} | Train Loss: {train_loss:.4f} Acc: {train_acc*100:.1f}% | Val Acc: {val_acc*100:.1f}%")
            
    # Final detailed class evaluation on test set
    model.eval()
    class_correct = {c: 0 for c in CLASSES}
    class_total = {c: 0 for c in CLASSES}
    with torch.no_grad():
        for path, label in test_samples:
            with Image.open(path) as img:
                img_t = val_transform(img.convert('RGB')).unsqueeze(0).to(device)
            out = model(img_t)
            pred = torch.argmax(out, dim=1).item()
            cls_true = CLASSES[label]
            class_total[cls_true] += 1
            if pred == label:
                class_correct[cls_true] += 1
                
    print("\n--- Per-Class Test Set Results ---")
    for c in CLASSES:
        tot = class_total[c]
        cor = class_correct[c]
        pct = (cor / tot * 100) if tot > 0 else 0
        print(f"  {c:25s}: {cor:2d}/{tot:2d} ({pct:5.1f}%)")
        
    # Export to ONNX
    os.makedirs('assets/models', exist_ok=True)
    onnx_path = 'assets/models/civiceye_vision_model.onnx'
    dummy_input = torch.randn(1, 3, 224, 224, device=device)
    
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['logits'],
        dynamic_axes={'input': {0: 'batch_size'}, 'logits': {0: 'batch_size'}},
        dynamo=False
    )
    print(f"\n Exported ONNX model to: {onnx_path}")
    
    # Save classes map
    classes_json_path = 'assets/models/vision_classes.json'
    with open(classes_json_path, 'w') as f:
        json.dump({
            "classes": CLASSES,
            "class_to_idx": CLASS_TO_IDX,
            "input_size": [224, 224],
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225]
        }, f, indent=2)
    print(f" Saved classes metadata to: {classes_json_path}")
    
    # Verify ONNX model with onnxruntime
    session = ort.InferenceSession(onnx_path)
    test_in = np.random.randn(1, 3, 224, 224).astype(np.float32)
    res = session.run(['logits'], {'input': test_in})
    print(f" ONNX verification passed! Output shape: {res[0].shape}")

if __name__ == '__main__':
    main()
