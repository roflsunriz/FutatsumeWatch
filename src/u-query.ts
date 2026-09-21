import { AntiPrototypeJs } from '../packages/lib/src/infra/anti-prototype-js';
import { uQuery } from '../packages/lib/src/u-query';

void AntiPrototypeJs().then(() => {
  const target = window as unknown as { uQuery?: typeof uQuery };
  if (!target.uQuery) target.uQuery = uQuery;
});
