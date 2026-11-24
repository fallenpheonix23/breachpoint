import testbedData from './data/testbed.json' with { type: 'json' };
import ashgroveData from './data/ashgrove.json' with { type: 'json' };
import kilnworksData from './data/kilnworks.json' with { type: 'json' };
import breachtestData from './data/breachtest.json' with { type: 'json' };

// JSON maps: registry entry carries the data; `test: true` keeps it out of the random rotation
const fromData = (d, extra = {}) => ({ id: d.id, name: d.name, location: d.location, desc: d.desc, swatch: d.swatch, theme: d.theme, mode: d.mode || 'tdm', data: d, ...extra });
export const TEST_MAPS = [fromData(testbedData, { test: true }), fromData(breachtestData, { test: true })];
const kilnworks = fromData(kilnworksData);
const ashgrove = fromData(ashgroveData);
export const MAPS = [ashgrove, kilnworks];
export const mapById = (id) => MAPS.find((m) => m.id === id) || TEST_MAPS.find((m) => m.id === id) || MAPS[0];
export const randomMap = () => MAPS[Math.floor(Math.random() * MAPS.length)];
