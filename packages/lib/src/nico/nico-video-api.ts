import { CrossDomainGate } from '../infra/cross-domain-gate';

interface NicoVideoGate {
  fetch: (...args: Array<unknown>) => Promise<unknown>;
  configBridge: (...args: Array<unknown>) => Promise<unknown>;
  postMessage: (...args: Array<unknown>) => unknown;
  sendMessage: (...args: Array<unknown>) => unknown;
  pushHistory: (...args: Array<unknown>) => unknown;
  bridgeDb: (...args: Array<unknown>) => Promise<unknown>;
}

interface NicoVideoApiType {
  fetch: (...args: Array<unknown>) => Promise<unknown>;
  configBridge: (...args: Array<unknown>) => Promise<unknown>;
  postMessage: (...args: Array<unknown>) => unknown;
  sendMessage: (...args: Array<unknown>) => unknown;
  pushHistory: (...args: Array<unknown>) => unknown;
  bridgeDb: (...args: Array<unknown>) => Promise<unknown>;
}

interface GateCommandPacket {
  command: string;
  status?: string;
  params?: { key: string; value: unknown } & Record<string, unknown>;
  value?: unknown;
}

interface GateConfigHolder {
  _config: { props: Record<string, unknown> };
}

//===BEGIN===
const NicoVideoApi: NicoVideoApiType = (() => {
  let gate: NicoVideoGate | null = null;
  const init = (): NicoVideoGate => {
    if (gate) {
      return gate;
    }

    if (location.host === 'www.nicovideo.jp') {
      return (gate = {} as unknown as NicoVideoGate);
    }
    class NVGate extends CrossDomainGate {
      _onCommand({ command, status, params, value }: GateCommandPacket, sessionId: string | null = null): unknown {
        switch (command) {
          case 'configSync':
            (this as unknown as GateConfigHolder)._config.props[(params as { key: string }).key] = (
              params as { value: unknown }
            ).value;
            break;
          default: {
            const packet: unknown = { command, status, params, value };
            const result: unknown = super._onCommand(
              packet as { command: string; status: string; params: unknown },
              sessionId
            );
            return result;
          }
        }
      }
    }

    return (gate = new NVGate({
      baseUrl: 'https://www.nicovideo.jp/robots.txt',
      origin: 'https://www.nicovideo.jp/',
      type: 'nicovideoApi',
      suffix: location.href,
    }) as unknown as NicoVideoGate);
  };

  return {
    fetch(...args: Array<unknown>): Promise<unknown> {
      return init().fetch(...args);
    },
    configBridge(...args: Array<unknown>): Promise<unknown> {
      return init().configBridge(...args);
    },
    postMessage(...args: Array<unknown>): unknown {
      return init().postMessage(...args);
    },
    sendMessage(...args: Array<unknown>): unknown {
      return init().sendMessage(...args);
    },
    pushHistory(...args: Array<unknown>): unknown {
      return init().pushHistory(...args);
    },
    bridgeDb(...args: Array<unknown>): Promise<unknown> {
      return init().bridgeDb(...args);
    },
  };
})();
//===END===

export { NicoVideoApi };
