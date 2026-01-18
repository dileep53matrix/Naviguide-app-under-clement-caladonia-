import { useEffect, useRef, useState } from "react";
import Map, { Source, Layer, Marker, Popup } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { ITINERARY_POINTS } from "./constants/itineraryPoints";
import { X } from "lucide-react";
import { WindDirectionArrow } from "./components/map/WindDirectionArrow";
import { getCardinalDirection } from "./utils/getCardinalDirection";

const API_URL = import.meta.env.VITE_API_URL;


export default function App() {
  const mapRef = useRef(null);
  const [segments, setSegments] = useState([]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // States pour les popups
  const [selectedWind, setSelectedWind] = useState(null);
  const [windLoading, setWindLoading] = useState(false);

  // 🌊 Nouveau state pour les vagues
  const [selectedWave, setSelectedWave] = useState(null);
  const [waveLoading, setWaveLoading] = useState(false);

  // 🌊 State pour les courants
  const [selectedCurrent, setSelectedCurrent] = useState(null);
  const [currentLoading, setCurrentLoading] = useState(false);

  // Points d'intérêt
  useEffect(() => {
    setPoints(ITINERARY_POINTS);
  }, []);

  // Fetch des segments
  useEffect(() => {
    if (points.length === 0) return;

    const legs = [];
    const nonMaritimeSegments = [
      [0, 1],
      [16, 0],
    ];

    for (let i = 0; i < points.length - 1; i++) {
      if (i === 12 || i === 14) continue;

      const a = points[i];
      const b = points[i + 1];
      legs.push({ from: a, to: b, fromIndex: i, toIndex: i + 1 });
    }

    legs.push({
      from: points[12],
      to: points[15],
      fromIndex: 12,
      toIndex: 15,
    });

    legs.push({
      from: points[13],
      to: points[14],
      fromIndex: 13,
      toIndex: 14,
    });

    const fetchLeg = async (leg) => {
      const isNonMaritime = nonMaritimeSegments.some(
        ([a, b]) => a === leg.fromIndex && b === leg.toIndex
      );

      if (isNonMaritime) {
        return {
          ...leg,
          coords: [
            [leg.from.lon, leg.from.lat],
            [leg.to.lon, leg.to.lat],
          ],
          nonMaritime: true,
        };
      }

      try {
        const params = new URLSearchParams({
          start_lat: leg.from.lat,
          start_lon: leg.from.lon,
          end_lat: leg.to.lat,
          end_lon: leg.to.lon,
          check_wind: true,
        });
        const res = await fetch(`${API_URL}/route?${params}`);
        const data = await res.json();

        if (data.type === "FeatureCollection" && data.features.length > 0) {
          const routeFeature = data.features[0];
          const alertPoints = data.features.slice(1);

          const windPoints = alertPoints.filter((p) => p.properties.highWind);
          const wavePoints = alertPoints.filter((p) => p.properties.highWave);
          const currentPoints = alertPoints.filter(
            (p) => p.properties.currents
          ); // 👈 ICI

          if (routeFeature.geometry && routeFeature.geometry.coordinates) {
            return {
              ...leg,
              coords: routeFeature.geometry.coordinates,
              windPoints,
              wavePoints,
              currentPoints, // 👈 Et on les ajoute ici
              nonMaritime: false,
            };
          }
        } else if (data.geometry && data.geometry.coordinates) {
          return {
            ...leg,
            coords: data.geometry.coordinates,
            windPoints: [],
            wavePoints: [],
            nonMaritime: false,
          };
        }
      } catch (e) {
        return {
          ...leg,
          coords: [],
          windPoints: [],
          wavePoints: [],
          error: e.message,
        };
      }
    };

    (async () => {
      setLoading(true);
      const results = await Promise.all(legs.map(fetchLeg));
      setSegments(results.filter((r) => r.coords && r.coords.length > 0));
      setLoading(false);
    })();
  }, [points]);

  // Fit bounds auto
  useEffect(() => {
    if (!mapRef.current || segments.length === 0) return;
    const map = mapRef.current.getMap();

    const allCoords = segments.flatMap((s) => s.coords);
    const lons = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);

    const bounds = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];

    map.fitBounds(bounds, { padding: 80, duration: 1000 });
  }, [segments]);

  // Construction GeoJSON
  const maritimeLines = {
    type: "FeatureCollection",
    features: segments
      .filter((s) => !s.nonMaritime)
      .map((s) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: s.coords },
      })),
  };

  const nonMaritimeLines = {
    type: "FeatureCollection",
    features: segments
      .filter((s) => s.nonMaritime)
      .map((s) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: s.coords },
      })),
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {loading && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col items-center justify-center z-10">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <div className="mt-6 text-white text-lg font-medium tracking-wide">
            Loading itinerary...
          </div>
        </div>
      )}
      {/* Simple Sidebar Toggle Button */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="bg-white p-3 rounded-lg shadow-lg hover:bg-gray-50"
        >
          ☰ Menu
        </button>
      </div>

      {/* Sidebar Panel */}
      {isSidebarOpen && (
        <div className="absolute top-0 left-0 w-80 h-full bg-white shadow-2xl z-20 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Navigation Controls</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500">
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold">Wind Points</h3>
              <p className="text-sm text-gray-600">Click red markers for wind data</p>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg">
              <h3 className="font-semibold">Wave Points</h3>
              <p className="text-sm text-gray-600">Click orange markers for wave data</p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold">Current Points</h3>
              <p className="text-sm text-gray-600">Click green arrows for current data</p>
            </div>

            {/* Add your custom controls here */}
          </div>
        </div>
      )}
      <Map
        ref={mapRef}
        initialViewState={{ latitude: 20, longitude: 0, zoom: 2 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://demotiles.maplibre.org/style.json"
        doubleClickZoom={false}
        dragRotate={false}
        touchZoomRotate={false}
        onLoad={(event) => {
          const map = event.target;
          const arrowSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0077ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>          `;

          const img = new Image(30, 30);
          img.onload = () => {
            if (!map.hasImage("arrow")) {
              map.addImage("arrow", img);
            }
          };
          img.src = "data:image/svg+xml;base64," + btoa(arrowSvg);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const { lng, lat } = e.lngLat;
          alert(`Latitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}`);
        }}
      >
        {/* Lignes maritimes */}
        <Source id="maritime" type="geojson" data={maritimeLines}>
          <Layer
            id="maritime-layer"
            type="line"
            paint={{
              "line-color": "#0077ff",
              "line-width": 3,
              "line-opacity": 0.9,
            }}
          />
          <Layer
            id="maritime-arrows"
            type="symbol"
            layout={{
              "symbol-placement": "line",
              "symbol-spacing": 100,
              "icon-image": "arrow",
              "icon-size": 0.8,
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
          />
        </Source>

        {/* Lignes non maritimes */}
        <Source id="non-maritime" type="geojson" data={nonMaritimeLines}>
          <Layer
            id="non-maritime-layer"
            type="line"
            paint={{
              "line-color": "orange",
              "line-width": 4,
              "line-dasharray": [2, 2],
            }}
          />
        </Source>

        {/* Points de vent fort (rouge) */}
        {segments.flatMap((s, segIdx) =>
          (s.windPoints || []).map((point, i) => {
            const [lon, lat] = point.geometry.coordinates;

            // 🌊 Vérifier si ce point a aussi des vagues hautes
            const hasHighWave = point.properties.highWave;

            const handleWindClick = async () => {
              setWindLoading(true);
              setSelectedWind({
                longitude: lon,
                latitude: lat,
                data: null,
              });

              try {
                const res = await fetch(`${API_URL}/wind`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ latitude: lat, longitude: lon }),
                });

                if (!res.ok) throw new Error("Erreur API vent");

                const data = await res.json();
                setSelectedWind({
                  longitude: lon,
                  latitude: lat,
                  data,
                });
              } catch (err) {
                console.error(err);
                setSelectedWind({
                  longitude: lon,
                  latitude: lat,
                  error: "Impossible to get wind data",
                });
              } finally {
                setWindLoading(false);
              }
            };

            return (
              <Marker
                key={`wind-${segIdx}-${i}`}
                longitude={lon}
                latitude={lat}
              >
                <div
                  onClick={handleWindClick}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    // 🌊 Si les deux alertes, utiliser une couleur différente (violet)
                    backgroundColor: hasHighWave ? "#9333ea" : "red",
                    border: "2px solid white",
                    boxShadow: `0 0 5px ${hasHighWave ? "rgba(147,51,234,0.5)" : "rgba(255,0,0,0.5)"
                      }`,
                    cursor: "pointer",
                  }}
                  title={
                    hasHighWave ? "Vent fort + Vagues hautes" : "Vent fort"
                  }
                />
              </Marker>
            );
          })
        )}

        {/* 🌊 Points de vagues hautes uniquement (orange) */}
        {segments.flatMap((s, segIdx) =>
          (s.wavePoints || [])
            .filter((point) => !point.properties.highWind) // Seulement ceux sans vent fort
            .map((point, i) => {
              const [lon, lat] = point.geometry.coordinates;

              const handleWaveClick = async () => {
                setWaveLoading(true);
                setSelectedWave({
                  longitude: lon,
                  latitude: lat,
                  data: null,
                });

                try {
                  const res = await fetch(`${API_URL}/wave`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ latitude: lat, longitude: lon }),
                  });

                  if (!res.ok) throw new Error("Erreur API vague");

                  const data = await res.json();

                  setSelectedWave({
                    longitude: lon,
                    latitude: lat,
                    data,
                  });
                } catch (err) {
                  console.error(err);
                  setSelectedWave({
                    longitude: lon,
                    latitude: lat,
                    error: "Impossible to get wave data",
                  });
                } finally {
                  setWaveLoading(false);
                }
              };

              return (
                <Marker
                  key={`wave-${segIdx}-${i}`}
                  longitude={lon}
                  latitude={lat}
                >
                  <div
                    onClick={handleWaveClick}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: "orange",
                      border: "2px solid white",
                      boxShadow: "0 0 5px rgba(255,165,0,0.5)",
                      cursor: "pointer",
                    }}
                    title="Vagues hautes"
                  />
                </Marker>
              );
            })
        )}

        {segments.flatMap((s, segIdx) =>
          (s.currentPoints || []).map((point, i) => {
            const [lon, lat] = point.geometry.coordinates;
            const currentData = point.properties.currents;
            const waveData = point.properties.highWave;
            const windData = point.properties.highWind;

            // 👉 Ne rien afficher si un point de vent ou de vague existe
            if (waveData || windData) return null;

            const rotation = currentData?.direction_deg || 0;

            const handleCurrentClick = async () => {
              setCurrentLoading(true);
              setSelectedCurrent({
                longitude: lon,
                latitude: lat,
                data: currentData,
              });
              setTimeout(() => setCurrentLoading(false), 300);
            };

            return (
              <Marker
                key={`current-${segIdx}-${i}`}
                longitude={lon}
                latitude={lat}
              >
                <div
                  onClick={handleCurrentClick}
                  style={{
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transform: `rotate(${rotation}deg)`,
                    filter: "drop-shadow(0 0 3px rgba(34,197,94,0.5))",
                  }}
                  title={`Courant: ${currentData?.speed_knots?.toFixed(
                    2
                  )} nœuds`}
                >
                  <svg
                    width="100"
                    height="100"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                </div>
              </Marker>
            );
          })
        )}

        {/* Popup vent */}
        {selectedWind && (
          <Popup
            longitude={selectedWind.longitude}
            latitude={selectedWind.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={25}
            onClose={() => setSelectedWind(null)}
            className="!bg-transparent !border-none !shadow-none custom-popup"
          >
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden min-w-[240px] animate-fadeIn">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between">
                <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span>Wind Data</span>
                </h4>
                <button
                  onClick={() => setSelectedWind(null)}
                  className="text-white/80 hover:text-white hover:bg-white/20 rounded w-6 h-6 flex items-center justify-center transition-colors font-bold"
                >
                  <X />
                </button>
              </div>

              <div className="p-4">
                {windLoading ? (
                  <div className="flex flex-col items-center py-5">
                    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <div className="mt-3 text-slate-500 text-sm">
                      Loading...
                    </div>
                  </div>
                ) : selectedWind.error ? (
                  <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-xl">⚠️</span>
                    <div className="text-red-600 text-sm">
                      {selectedWind.error}
                    </div>
                  </div>
                ) : selectedWind.data ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                          💨
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">
                            Speed
                          </div>
                          <div className="text-base font-semibold text-slate-800">
                            {selectedWind.data.wind_speed_kmh} km/h
                          </div>
                        </div>
                      </div>
                    </div>
                    

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <WindDirectionArrow
                          direction={selectedWind.data.wind_direction}
                        />
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">
                            Direction
                          </div>
                          <div className="text-base font-semibold text-slate-800">
                            {selectedWind.data.wind_direction}°{" "}
                            {getCardinalDirection(
                              selectedWind.data.wind_direction
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-5 text-center text-slate-500 text-sm">
                    No data available
                  </div>
                )}
              </div>
            </div>
          </Popup>
        )}

        {/* 🌊 Popup vagues */}
        {selectedWave && (
          <Popup
            longitude={selectedWave.longitude}
            latitude={selectedWave.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={25}
            onClose={() => setSelectedWave(null)}
            className="!bg-transparent !border-none !shadow-none custom-popup"
          >
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden min-w-[240px] animate-fadeIn">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center justify-between">
                <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span>Wave Data</span>
                </h4>
                <button
                  onClick={() => setSelectedWave(null)}
                  className="text-white/80 hover:text-white hover:bg-white/20 rounded w-6 h-6 flex items-center justify-center transition-colors font-bold"
                >
                  <X />
                </button>
              </div>

              <div className="p-4">
                {waveLoading ? (
                  <div className="flex flex-col items-center py-5">
                    <div className="w-8 h-8 border-4 border-orange-100 border-t-orange-600 rounded-full animate-spin" />
                    <div className="mt-3 text-slate-500 text-sm">
                      Loading...
                    </div>
                  </div>
                ) : selectedWave.error ? (
                  <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-xl">⚠️</span>
                    <div className="text-red-600 text-sm">
                      {selectedWave.error}
                    </div>
                  </div>
                ) : selectedWave.data ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                          🌊
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">
                            Significant Height
                          </div>
                          <div className="text-base font-semibold text-slate-800">
                            {selectedWave.data.significant_wave_height_m} m
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedWave.data.mean_wave_period && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                            ⏱️
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-0.5">
                              Period
                            </div>
                            <div className="text-base font-semibold text-slate-800">
                              {selectedWave.data.mean_wave_period} s
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedWave.data.mean_wave_direction && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                            🧭
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-0.5">
                              Direction
                            </div>
                            <div className="text-base font-semibold text-slate-800">
                              {selectedWave.data.mean_wave_direction}°
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-5 text-center text-slate-500 text-sm">
                    No data available
                  </div>
                )}
              </div>
            </div>
          </Popup>
        )}

        {selectedCurrent && (
          <Popup
            longitude={selectedCurrent.longitude}
            latitude={selectedCurrent.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={25}
            onClose={() => setSelectedCurrent(null)}
            className="!bg-transparent !border-none !shadow-none custom-popup"
          >
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden min-w-[240px] animate-fadeIn">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 flex items-center justify-between">
                <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span>Current Data</span>
                </h4>
                <button
                  onClick={() => setSelectedCurrent(null)}
                  className="text-white/80 hover:text-white hover:bg-white/20 rounded w-6 h-6 flex items-center justify-center transition-colors font-bold"
                >
                  <X />
                </button>
              </div>

              <div className="p-4">
                {currentLoading ? (
                  <div className="flex flex-col items-center py-5">
                    <div className="w-8 h-8 border-4 border-green-100 border-t-green-600 rounded-full animate-spin" />
                    <div className="mt-3 text-slate-500 text-sm">
                      Loading...
                    </div>
                  </div>
                ) : selectedCurrent.error ? (
                  <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-xl">⚠️</span>
                    <div className="text-red-600 text-sm">
                      {selectedCurrent.error}
                    </div>
                  </div>
                ) : selectedCurrent.data ? (
                  <div className="space-y-3">
                    {/* 💨 Vitesse */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                          🌊
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">
                            Speed
                          </div>
                          <div className="text-base font-semibold text-slate-800">
                            {selectedCurrent.data.speed_knots.toFixed(2)} kn
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 🧭 Direction */}
                    {selectedCurrent.data.direction_deg && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg">
                            🧭
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-0.5">
                              Direction
                            </div>
                            <div className="text-base font-semibold text-slate-800">
                              {selectedCurrent.data.direction_deg.toFixed(1)}°
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-5 text-center text-slate-500 text-sm">
                    No data available
                  </div>
                )}
              </div>
            </div>
          </Popup>
        )}

        {/* Drapeaux */}
        {points.map((p, i) => (
          <>
            {p.flag !== "" ? (
              <Marker key={i} longitude={p.lon} latitude={p.lat}>
                <img
                  src={p.flag}
                  alt={p.name}
                  title={p.name}
                  style={{
                    width: 32,
                    height: 24,
                    borderRadius: 4,
                    boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                  }}
                />
              </Marker>
            ) : (
              ""
            )}
          </>
        ))}
      </Map>
    </div>
  );
}
