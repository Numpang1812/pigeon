/**
 * Clean basemap for pigeon map: Esri World Topo Map with smooth terrain,
 * soft styling, and no harsh outlines or watermarks.
 */

const TOPO_URL =
	'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;

/** Add clean basemap to a freshly created map. */
export function add_basemap(leaflet_lib: LeafletModule, map: LeafletMap): void {
	leaflet_lib
		.tileLayer(TOPO_URL, {
			minZoom: 2,
			maxZoom: 19,
			attribution:
				'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
			noWrap: false
		})
		.addTo(map);
}


