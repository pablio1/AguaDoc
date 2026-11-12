import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre GL JS v6 does not resolve its worker under Vite without this.
setWorkerUrl(workerUrl);
