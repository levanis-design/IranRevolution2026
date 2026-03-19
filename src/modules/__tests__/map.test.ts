import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initMap, onShowListView } from '../map'
import type { MemorialEntry } from '../types'

// Mock leaflet and its marker cluster plugin
vi.mock('leaflet.markercluster', () => {
  return {
    default: {}
  }
})

const mockMap = {
  invalidateSize: vi.fn(),
  setView: vi.fn(),
}

const mockTileLayer = {
  on: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
}

const mockMarkerClusterGroup = {
  addTo: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  clearLayers: vi.fn().mockReturnThis(),
  eachLayer: vi.fn().mockReturnThis(),
}

const mockMarker = {
  bindTooltip: vi.fn(),
  on: vi.fn(),
  addTo: vi.fn(),
}

vi.mock('leaflet', () => {
  return {
    default: {
      map: vi.fn(() => mockMap),
      tileLayer: vi.fn(() => mockTileLayer),
      markerClusterGroup: vi.fn(() => mockMarkerClusterGroup),
      marker: vi.fn(() => mockMarker),
      divIcon: vi.fn(),
      point: vi.fn(),
    },
    map: vi.fn(() => mockMap),
    tileLayer: vi.fn(() => mockTileLayer),
    markerClusterGroup: vi.fn(() => mockMarkerClusterGroup),
    marker: vi.fn(() => mockMarker),
    divIcon: vi.fn(),
    point: vi.fn(),
  }
})

/**
 * @vitest-environment jsdom
 */

describe('map module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="map-container"></div>'
    // Mock ResizeObserver
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('registers a callback with onShowListView and executes it on clusterclick', () => {
    // 1. Setup mock functions for clusterclick
    let clusterClickCallback: ((event: unknown) => void) | null = null

    mockMarkerClusterGroup.on.mockImplementation((event, cb) => {
      if (event === 'clusterclick') {
        clusterClickCallback = cb as (event: unknown) => void
      }
    })

    // 2. Initialize the map
    initMap()

    // 3. Register our callback
    const mockCb = vi.fn()
    onShowListView(mockCb)

    // 4. Simulate the cluster click
    expect(clusterClickCallback).not.toBeNull()

    // Create mock cluster and markers
    const mockEntry: MemorialEntry = {
      id: '1',
      name: 'Test',
      city: 'Test City',
      location: 'Test Loc',
      date: '2023-01-01'
    }

    const mockCluster = {
      layer: {
        getAllChildMarkers: () => [
          { entry: mockEntry },
          { entry: undefined } // Should be filtered out
        ]
      }
    }

    if (clusterClickCallback) {
      (clusterClickCallback as (event: unknown) => void)(mockCluster)
    }

    // 5. Assert the callback was called with the correct entries
    expect(mockCb).toHaveBeenCalledTimes(1)
    expect(mockCb).toHaveBeenCalledWith([mockEntry])
  })

  it('filters out markers without entries on clusterclick', () => {
    let clusterClickCallback: ((event: unknown) => void) | null = null

    mockMarkerClusterGroup.on.mockImplementation((event, cb) => {
      if (event === 'clusterclick') {
        clusterClickCallback = cb as (event: unknown) => void
      }
      return mockMarkerClusterGroup
    })

    initMap()

    const mockCb = vi.fn()
    onShowListView(mockCb)

    const mockCluster = {
      layer: {
        getAllChildMarkers: () => [
          { entry: undefined },
          { entry: null },
          {}
        ]
      }
    }

    if (clusterClickCallback) {
      (clusterClickCallback as (event: unknown) => void)(mockCluster)
    }

    expect(mockCb).toHaveBeenCalledTimes(1)
    expect(mockCb).toHaveBeenCalledWith([])
  })
})
