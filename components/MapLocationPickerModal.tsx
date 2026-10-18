import { AppColors } from '@/constants/colors';
import { reverseGeocodeLocation } from '@/services/complaintService';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  initialLatitude?: number;
  initialLongitude?: number;
  initialAddress?: string;
  onConfirm: (result: { latitude: number; longitude: number; address: string }) => void;
  onClose: () => void;
}

// Default center coordinates (e.g. Coimbatore center / standard urban area)
const DEFAULT_LAT = 11.0168;
const DEFAULT_LNG = 76.9558;

// Popular quick jump landmarks for fast selection
const QUICK_LANDMARKS = [
  { label: 'Gandhipuram', lat: 11.0183, lng: 76.9674 },
  { label: 'RS Puram', lat: 11.0086, lng: 76.9511 },
  { label: 'Town Hall', lat: 10.9967, lng: 76.9614 },
  { label: 'Peelamedu', lat: 11.0267, lng: 77.0125 },
  { label: 'Railway Station', lat: 10.9995, lng: 76.9658 },
];

export default function MapLocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  initialAddress,
  onConfirm,
  onClose,
}: Props) {
  const [latitude, setLatitude] = useState<number>(initialLatitude || DEFAULT_LAT);
  const [longitude, setLongitude] = useState<number>(initialLongitude || DEFAULT_LNG);
  const [address, setAddress] = useState<string>(initialAddress || '');
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locatingGPS, setLocatingGPS] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(15);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerReverseGeocode = useCallback((lat: number, lng: number) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(async () => {
      setLoadingAddress(true);
      try {
        const addr = await reverseGeocodeLocation(lat, lng);
        setAddress(addr);
      } catch (err) {
        console.warn('Geocoding error:', err);
        setAddress(`Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`);
      } finally {
        setLoadingAddress(false);
      }
    }, 350);
  }, []);

  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible && !prevVisible) {
    setPrevVisible(true);
    const lat = initialLatitude && initialLatitude !== 0 ? initialLatitude : DEFAULT_LAT;
    const lng = initialLongitude && initialLongitude !== 0 ? initialLongitude : DEFAULT_LNG;
    setLatitude(lat);
    setLongitude(lng);
    if (initialAddress) {
      setAddress(initialAddress);
    }
  } else if (!visible && prevVisible) {
    setPrevVisible(false);
  }

  useEffect(() => {
    if (visible && !initialAddress) {
      const lat = initialLatitude && initialLatitude !== 0 ? initialLatitude : DEFAULT_LAT;
      const lng = initialLongitude && initialLongitude !== 0 ? initialLongitude : DEFAULT_LNG;
      triggerReverseGeocode(lat, lng);
    }
  }, [visible, initialAddress, initialLatitude, initialLongitude, triggerReverseGeocode]);

  const updateCoordinates = (newLat: number, newLng: number) => {
    // Keep within valid lat/long ranges
    const boundedLat = Math.max(-90, Math.min(90, newLat));
    const boundedLng = Math.max(-180, Math.min(180, newLng));
    setLatitude(boundedLat);
    setLongitude(boundedLng);
    triggerReverseGeocode(boundedLat, boundedLng);
  };

  // Directional nudge (Pan)
  const panOffset = zoomLevel >= 16 ? 0.0003 : zoomLevel >= 14 ? 0.0008 : 0.002;
  const panNorth = () => updateCoordinates(latitude + panOffset, longitude);
  const panSouth = () => updateCoordinates(latitude - panOffset, longitude);
  const panWest = () => updateCoordinates(latitude, longitude - panOffset);
  const panEast = () => updateCoordinates(latitude, longitude + panOffset);

  // Search landmark / address
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (results && results.length > 0) {
        const { latitude: resLat, longitude: resLng } = results[0];
        updateCoordinates(resLat, resLng);
      } else {
        Alert.alert('Location Not Found', `No coordinates found for "${searchQuery}". Please try another landmark or street name.`);
      }
    } catch (err) {
      console.warn('Search geocode error:', err);
      Alert.alert('Search Error', 'Unable to search for location. Please try panning the map manually.');
    } finally {
      setSearching(false);
    }
  };

  // Center on current GPS as starting point
  const handleUseCurrentGPS = async () => {
    setLocatingGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location permission is required to fetch current GPS. You can still select your location on the map manually.'
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateCoordinates(loc.coords.latitude, loc.coords.longitude);
    } catch (err) {
      console.warn('GPS location error:', err);
      Alert.alert('GPS Unavailable', 'Could not obtain current GPS location. Please choose your location manually.');
    } finally {
      setLocatingGPS(false);
    }
  };

  const handleConfirm = () => {
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      Alert.alert('Invalid Coordinates', 'Please select a valid location on the map.');
      return;
    }
    const finalAddress = address || `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;
    onConfirm({
      latitude,
      longitude,
      address: finalAddress,
    });
  };

  // Generate OpenStreetMap Tile Image URL for visual map rendering
  // Convert lat/lng to Slippy Map tile numbers
  const latRad = (latitude * Math.PI) / 180;
  const n = Math.pow(2, zoomLevel);
  const xTile = Math.floor(((longitude + 180) / 360) * n);
  const yTile = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  const tileUrl = `https://tile.openstreetmap.org/${zoomLevel}/${xTile}/${yTile}.png`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.safeContainer}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Ionicons name="map" size={22} color={AppColors.primary} />
                <View>
                  <Text style={styles.headerTitle}>Select Issue Location</Text>
                  <Text style={styles.headerSubtitle}>Pinpoint the exact location where the road issue exists</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close map selector"
              >
                <Ionicons name="close" size={24} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Search Landmark Bar */}
            <View style={styles.searchBarRow}>
              <Ionicons name="search-outline" size={18} color={AppColors.placeholder} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search landmark, street, or area name..."
                placeholderTextColor={AppColors.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={16} color={AppColors.placeholder} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.searchSubmitBtn, searching && styles.disabledBtn]}
                onPress={handleSearch}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <Text style={styles.searchSubmitBtnText}>Search</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Landmark Chips */}
            <View style={styles.chipsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                {QUICK_LANDMARKS.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.chip}
                    onPress={() => updateCoordinates(item.lat, item.lng)}
                  >
                    <Ionicons name="pin-outline" size={12} color={AppColors.primary} />
                    <Text style={styles.chipText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Visual Map Canvas / Interactive Viewport */}
            <View style={styles.mapViewport}>
              {/* Map Tile Background */}
              <Image
                source={{ uri: tileUrl }}
                style={styles.mapTileImage}
                resizeMode="cover"
              />

              {/* Grid / Street Overlay */}
              <View style={styles.gridOverlay} pointerEvents="none" />

              {/* Central Pin Marker with Pulse Animation */}
              <View style={styles.pinContainer} pointerEvents="none">
                <View style={styles.pulseRing} />
                <View style={styles.pinShadow} />
                <Ionicons name="location" size={42} color={AppColors.primary} style={styles.pinIcon} />
                <View style={styles.pinCenterDot} />
              </View>

              {/* Map Floating Actions: Pan D-Pad & Zoom */}
              <View style={styles.mapControlsOverlay}>
                {/* D-Pad Pan Navigation */}
                <View style={styles.dpadContainer}>
                  <TouchableOpacity
                    style={[styles.dpadBtn, styles.dpadNorth]}
                    onPress={panNorth}
                    accessibilityLabel="Pan north"
                  >
                    <Ionicons name="chevron-up" size={20} color={AppColors.textPrimary} />
                  </TouchableOpacity>

                  <View style={styles.dpadMiddleRow}>
                    <TouchableOpacity
                      style={[styles.dpadBtn, styles.dpadWest]}
                      onPress={panWest}
                      accessibilityLabel="Pan west"
                    >
                      <Ionicons name="chevron-back" size={20} color={AppColors.textPrimary} />
                    </TouchableOpacity>

                    <View style={styles.dpadCenter}>
                      <Ionicons name="scan-outline" size={16} color={AppColors.primary} />
                    </View>

                    <TouchableOpacity
                      style={[styles.dpadBtn, styles.dpadEast]}
                      onPress={panEast}
                      accessibilityLabel="Pan east"
                    >
                      <Ionicons name="chevron-forward" size={20} color={AppColors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.dpadBtn, styles.dpadSouth]}
                    onPress={panSouth}
                    accessibilityLabel="Pan south"
                  >
                    <Ionicons name="chevron-down" size={20} color={AppColors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Right Column: Zoom & Center GPS */}
                <View style={styles.rightControls}>
                  <TouchableOpacity
                    style={styles.mapControlBtn}
                    onPress={() => setZoomLevel(prev => Math.min(18, prev + 1))}
                    accessibilityLabel="Zoom in"
                  >
                    <Ionicons name="add" size={20} color={AppColors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.mapControlBtn}
                    onPress={() => setZoomLevel(prev => Math.max(12, prev - 1))}
                    accessibilityLabel="Zoom out"
                  >
                    <Ionicons name="remove" size={20} color={AppColors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mapControlBtn, styles.gpsCenterBtn]}
                    onPress={handleUseCurrentGPS}
                    disabled={locatingGPS}
                    accessibilityLabel="Center on my GPS"
                  >
                    {locatingGPS ? (
                      <ActivityIndicator size="small" color={AppColors.primary} />
                    ) : (
                      <Ionicons name="locate" size={20} color={AppColors.primary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Map Guide Tag */}
              <View style={styles.mapGuideTag}>
                <Ionicons name="move" size={13} color={AppColors.white} />
                <Text style={styles.mapGuideTagText}>Use arrows or search to position pin</Text>
              </View>
            </View>

            {/* Selected Location Summary Card */}
            <View style={styles.locationSummaryCard}>
              <View style={styles.locationSummaryTop}>
                <View style={styles.locationSummaryBadge}>
                  <Ionicons name="navigate-circle" size={16} color={AppColors.primary} />
                  <Text style={styles.locationSummaryBadgeText}>Selected Issue Location</Text>
                </View>
                <Text style={styles.coordsText}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </Text>
              </View>

              <View style={styles.addressRow}>
                {loadingAddress ? (
                  <View style={styles.addressLoadingRow}>
                    <ActivityIndicator size="small" color={AppColors.primary} />
                    <Text style={styles.addressLoadingText}>Reverse geocoding address...</Text>
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addressText} numberOfLines={2}>
                      {address || 'Fetching address details...'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Footer Buttons */}
            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Cancel map selection"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirm}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Confirm Issue Location"
              >
                <Ionicons name="checkmark-circle" size={20} color={AppColors.white} />
                <Text style={styles.confirmBtnText}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  safeContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '94%',
    ...Platform.select({
      web: {
        boxShadow: '0px -4px 10px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingLeft: 10,
    paddingRight: 4,
    height: 44,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: AppColors.textPrimary,
    paddingVertical: 8,
  },
  clearSearchBtn: {
    padding: 4,
    marginRight: 4,
  },
  searchSubmitBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  searchSubmitBtnText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  chipsContainer: {
    marginTop: 8,
    marginBottom: 10,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
  },
  mapViewport: {
    position: 'relative',
    height: 250,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1.5,
    borderColor: AppColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTileImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(235, 248, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
  },
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -21,
    marginTop: -38,
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    top: 14,
    left: 0,
  },
  pinShadow: {
    position: 'absolute',
    width: 14,
    height: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    bottom: -2,
  },
  pinIcon: {
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 6px rgba(15, 118, 110, 0.3)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
  },
  pinCenterDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.white,
    top: 13,
  },
  mapControlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    pointerEvents: 'box-none',
  },
  dpadContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 28,
    padding: 4,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
    borderWidth: 1,
    borderColor: AppColors.border,
    alignSelf: 'flex-start',
  },
  dpadMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dpadBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  dpadNorth: { marginBottom: 2 },
  dpadSouth: { marginTop: 2 },
  dpadWest: { marginRight: 2 },
  dpadEast: { marginLeft: 2 },
  dpadCenter: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightControls: {
    gap: 8,
    alignSelf: 'flex-start',
  },
  mapControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.12)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  gpsCenterBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  mapGuideTag: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mapGuideTagText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  locationSummaryCard: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  locationSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  locationSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  locationSummaryBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: AppColors.primary,
  },
  coordsText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textSecondary,
    flexShrink: 1,
  },
  addressRow: {
    marginTop: 2,
  },
  addressLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  addressLoadingText: {
    fontSize: 13,
    color: AppColors.textSecondary,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textPrimary,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: AppColors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0px 3px 4px rgba(15, 118, 110, 0.2)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.white,
  },
});
