import { NicoChatInitFunc } from './NicoChat';
import { NicoTextParserInitFunc } from './NicoTextParser';
import { workerUtil } from '../../../lib/src/infra/workerUtil';
import type { NicoChatData, NicoChatOptions, NicoChatType } from './NicoChat';

interface NicoTextParserFactory {
  likeHTML5(text: string): string;
  likeXP(text: string): string;
}

interface ParseWorkerOptions {
  duration?: unknown;
  mainThreadId?: unknown;
  maxCommentsByDuration?: unknown;
  MAX_COMMENT?: unknown;
  format?: unknown;
}

interface ParseWorkerMessage {
  command: string;
  params: {
    chatsData?: unknown;
    options?: ParseWorkerOptions;
  };
}

interface ParseWorkerScope {
  onmessage: ((message: ParseWorkerMessage) => unknown) | null;
}

interface CrossMessageWorkerUtil {
  createCrossMessageWorker(
    func: string,
    options?: { name?: string }
  ): {
    post(message: unknown): Promise<unknown>;
  };
}

type ChatFactory = (data: NicoChatData, options: NicoChatOptions) => NicoChatType;
//===BEGIN===
const NicoChatParseWorker = () => {
  const _func = function (self: ParseWorkerScope): void {
    const NicoTextParser = (NicoTextParserInitFunc as unknown as () => NicoTextParserFactory)();
    const NicoChat = NicoChatInitFunc();

    const parse = (
      chatsData: unknown[] = [],
      options: ParseWorkerOptions = {}
    ): {
      nicoChats: NicoChatType[];
      nicoscripts: NicoChatType[];
    } => {
      let nicoChats: NicoChatType[] = [];
      const nicoscripts: NicoChatType[] = [];
      const videoDuration = parseInt((options.duration || 0x7fffff) as string);
      const mainThreadId = options.mainThreadId || 0;
      const maxCommentsByDuration = Number(options.maxCommentsByDuration || 1000);
      const MAX_COMMENT = Number(options.MAX_COMMENT || 5000);

      const create: ChatFactory =
        options.format !== 'xml'
          ? (data, opts) => NicoChat.create(data, opts)
          : (data, opts) => NicoChat.createFromChatElement(data as unknown as Element, opts);
      for (let i = 0, len = Math.min(chatsData.length, MAX_COMMENT); i < len; i++) {
        const nicoChat = create(chatsData[i] as NicoChatData, { videoDuration, mainThreadId });
        if (nicoChat.isDeleted) {
          continue;
        }

        if (nicoChat.isNicoScript) {
          nicoscripts.push(nicoChat);
        }
        nicoChats.push(nicoChat);
      }
      nicoChats = ([] as NicoChatType[])
        .concat(...nicoChats.filter((c) => c.isPatissier && c.fork < 1 && c.isSubThread).splice(maxCommentsByDuration))
        .concat(...nicoChats.filter((c) => c.isPatissier && c.fork < 1 && !c.isSubThread).splice(maxCommentsByDuration))
        .concat(...nicoChats.filter((c) => !c.isPatissier || c.fork > 0));

      nicoChats.forEach((nicoChat) => {
        const htmlText =
          nicoChat.commentVer === 'html5'
            ? NicoTextParser.likeHTML5(nicoChat.text)
            : NicoTextParser.likeXP(nicoChat.text);
        nicoChat.htmlText = htmlText;
      });

      return {
        nicoChats,
        nicoscripts,
      };
    };

    self.onmessage = ({ command, params }: ParseWorkerMessage): unknown => {
      let result: unknown;
      console.time(`NicoChatParseWorker.${command}`);
      switch (command) {
        case 'parse':
          result = parse(params as unknown as unknown[]);
          break;
      }
      console.timeEnd(`NicoChatParseWorker.${command}`);
      return result;
    };
  };
  const func = `
  function(self) {
    ${(NicoTextParserInitFunc as unknown as { toString(): string }).toString()}
    ${NicoChatInitFunc.toString()}
    (${_func.toString()})(self);
  }
  `;

  let worker: { post(message: unknown): Promise<unknown> } | undefined;

  // const videoDuration;
  // const mainThreadId;
  // const maxCommentsByDuration;
  // const MAX_COMMENT;
  // const format
  const parse = async (chatsData: unknown, options: ParseWorkerOptions = {}): Promise<unknown> => {
    const util = workerUtil as unknown as CrossMessageWorkerUtil;
    worker = worker || util.createCrossMessageWorker(func);
    return await worker.post({ command: 'parse', params: { chatsData, options } });
  };

  return { parse };
};
//===END===
export { NicoChatParseWorker };
