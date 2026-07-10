import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
  useClones: false,
  deleteOnExpire: true
});

export default cache;

