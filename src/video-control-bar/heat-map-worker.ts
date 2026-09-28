import { HeatMapWorker } from '../../packages/futatsume/src/heatMap/heat-map-worker';
import type { VcbHeatMap } from './types';

export { HeatMapWorker };

export function initializeHeatMap(container: Element, onReady: (worker: VcbHeatMap) => void): void {
  void HeatMapWorker.init({ container }).then((worker: unknown) => onReady(worker as VcbHeatMap));
}
