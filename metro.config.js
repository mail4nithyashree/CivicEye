const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 1. Remove .onnx from assetExts to prevent 100MB+ model binaries from being loaded into Metro memory
config.resolver.assetExts = (config.resolver.assetExts || []).filter(ext => ext !== 'onnx');

// 2. Exclude heavy non-frontend directories and model files specifically in project root
config.resolver.blockList = [
  new RegExp(`^${path.resolve(__dirname, 'AI').replace(/\\/g, '[\\\\/]')}.*`),
  new RegExp(`^${path.resolve(__dirname, 'experiments').replace(/\\/g, '[\\\\/]')}.*`),
  new RegExp(`^${path.resolve(__dirname, 'dataset_working').replace(/\\/g, '[\\\\/]')}.*`),
  new RegExp(`^${path.resolve(__dirname, 'scripts').replace(/\\/g, '[\\\\/]')}.*`),
  new RegExp(`^${path.resolve(__dirname, 'assets', 'models').replace(/\\/g, '[\\\\/]')}.*\\.onnx$`),
];

// 3. Always redirect onnxruntime-react-native & onnxruntime-node to our safe mock
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'onnxruntime-react-native' || moduleName === 'onnxruntime-node') {
    return {
      filePath: path.resolve(__dirname, 'mocks/onnxruntime-react-native.ts'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
