// Builds one of the hand-authored maps (see src/maps/).
import { MapKit } from './maps/kit.js';
import { buildFromData } from './maps/loader.js';
export function buildMap(scene, T, def) {
  if (def.data) return buildFromData(scene, T, def.data);
  const kit = new MapKit(scene, T, def.theme);
  def.build(kit);
  return kit.finish({ id: def.id, name: def.name, location: def.location });
}
