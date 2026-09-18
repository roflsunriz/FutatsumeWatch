import { ZenzaWatch } from '../../../../src/FutatsumeWatchIndex';
import { workerUtil } from '../../../lib/src/infra/workerUtil';

interface LayoutChat {
  isOverflow?: boolean;
  isInvisible?: boolean;
  invisible?: boolean;
  layerId: unknown;
  ypos: number;
  height: number;
  beginLeft: number;
  beginRight: number;
  endLeft: number;
  endRight: number;
  isFixed?: boolean;
  id: unknown;
  type?: unknown;
}

interface LayoutWorkerMessage {
  command: string;
  params: {
    type?: unknown;
    members?: LayoutChat[];
    lastUpdate?: unknown;
  };
}

interface LayoutWorkerScope {
  onmessage: ((message: LayoutWorkerMessage) => unknown) | null;
}

interface LayoutWorkerConfig {
  [key: string]: unknown;
}

interface ZenzaWatchLike {
  config: LayoutWorkerConfig;
}

interface CrossMessageWorkerUtil {
  createCrossMessageWorker(
    func: (self: LayoutWorkerScope) => void,
    options: { name: string }
  ): { post(message: unknown): Promise<unknown> };
}

const Config = (ZenzaWatch as unknown as ZenzaWatchLike).config;

//===BEGIN===

const CommentLayoutWorker = ((config: LayoutWorkerConfig) => {
  const func = function (self: LayoutWorkerScope): void {
    // 暫定設置
    const TYPE = {
      TOP: 'ue',
      NAKA: 'naka',
      BOTTOM: 'shita',
    };

    const SCREEN = {
      WIDTH_INNER: 512,
      WIDTH_FULL_INNER: 640,
      WIDTH: 512 + 32,
      WIDTH_FULL: 640 + 32,
      HEIGHT: 384,
    };

    const isConflict = (target: LayoutChat, others: LayoutChat): boolean => {
      // 一度はみ出した文字は当たり判定を持たない
      if (target.isOverflow || others.isOverflow || others.isInvisible) {
        return false;
      }

      if (target.layerId !== others.layerId) {
        return false;
      }

      // Y座標が合わないなら絶対衝突しない
      const othersY = others.ypos;
      const targetY = target.ypos;
      if (othersY + others.height < targetY || othersY > targetY + target.height) {
        return false;
      }

      // ターゲットと自分、どっちが右でどっちが左か？の判定
      let rt, lt;
      if (target.beginLeft <= others.beginLeft) {
        lt = target;
        rt = others;
      } else {
        lt = others;
        rt = target;
      }

      if (target.isFixed) {
        // 左にあるやつの終了より右にあるやつの開始が早いなら、衝突する
        // > か >= で挙動が変わるCAがあったりして正解がわからない
        if (lt.endRight > rt.beginLeft) {
          return true;
        }
      } else {
        // 左にあるやつの右端開始よりも右にあるやつの左端開始のほうが早いなら、衝突する
        if (lt.beginRight >= rt.beginLeft) {
          return true;
        }

        // 左にあるやつの右端終了よりも右にあるやつの左端終了のほうが早いなら、衝突する
        if (lt.endRight >= rt.endLeft) {
          return true;
        }
      }

      return false;
    };

    const moveToNextLine = (self: LayoutChat, others: LayoutChat): LayoutChat => {
      const margin = 1;
      const othersHeight = others.height + margin;
      // 本来はちょっとでもオーバーしたらランダムすべきだが、
      // 本家とまったく同じサイズ計算は難しいのでマージンを入れる
      // コメントアートの再現という点では有効な妥協案
      const overflowMargin = 10;
      const rnd = Math.max(0, SCREEN.HEIGHT - self.height);
      const yMax = SCREEN.HEIGHT - self.height + overflowMargin;
      const yMin = 0 - overflowMargin;

      const type = self.type;
      let ypos = self.ypos;

      if (type !== TYPE.BOTTOM) {
        ypos += othersHeight;
        // 画面内に入りきらなかったらランダム配置
        if (ypos > yMax) {
          self.isOverflow = true;
        }
      } else {
        ypos -= othersHeight;
        // 画面内に入りきらなかったらランダム配置
        if (ypos < yMin) {
          self.isOverflow = true;
        }
      }

      self.ypos = self.isOverflow ? Math.floor(Math.random() * rnd) : ypos;

      return self;
    };

    /**
     * 最初に衝突が起こりうるindexを返す。
     * 処理効率化のための物
     */
    const findCollisionStartIndex = (target: LayoutChat, members: LayoutChat[]): number => {
      const tl = target.beginLeft;
      const tr = target.endRight;
      const layerId = target.layerId;
      for (let i = 0, len = members.length; i < len; i++) {
        const o = members[i] as LayoutChat;
        const ol = o.beginLeft;
        const or = o.endRight;

        // 自分よりうしろのメンバーには影響を受けないので処理不要
        if (o.id === target.id) {
          return -1;
        }

        if (layerId !== o.layerId || o.invisible || o.isOverflow) {
          continue;
        }

        if (tl <= or && tr >= ol) {
          return i;
        }
      }

      return -1;
    };

    const _checkCollision = (target: LayoutChat, members: LayoutChat[], collisionStartIndex: number): LayoutChat => {
      const beginLeft = target.beginLeft;
      for (let i = collisionStartIndex, len = members.length; i < len; i++) {
        const o = members[i] as LayoutChat;

        // 自分よりうしろのメンバーには影響を受けないので処理不要
        if (o.id === target.id) {
          return target;
        }

        if (beginLeft > o.endRight) {
          continue;
        }

        if (isConflict(target, o)) {
          target = moveToNextLine(target, o);

          // ずらした後は再度全チェックするのを忘れずに(再帰)
          if (!target.isOverflow) {
            return _checkCollision(target, members, collisionStartIndex);
          }
        }
      }
      return target;
    };

    const checkCollision = (target: LayoutChat, members: LayoutChat[]): LayoutChat => {
      if (target.isInvisible) {
        return target;
      }

      const collisionStartIndex = findCollisionStartIndex(target, members);

      if (collisionStartIndex < 0) {
        return target;
      }

      return _checkCollision(target, members, collisionStartIndex);
    };

    const groupCollision = (members: LayoutChat[]): LayoutChat[] => {
      for (let i = 0, len = members.length; i < len; i++) {
        //members[i] =
        checkCollision(members[i] as LayoutChat, members);
      }
      return members;
    };

    self.onmessage = ({ command, params }: LayoutWorkerMessage): unknown => {
      void command;
      const { type, members, lastUpdate } = params;
      console.time('CommentLayoutWorker: ' + String(type));
      if (members) {
        groupCollision(members);
      }
      console.timeEnd('CommentLayoutWorker: ' + String(type));
      return { type, members, lastUpdate };
    };
  };

  let instance: { post(message: unknown): Promise<unknown> } | null = null;
  return {
    _func: func,
    create: (): { post(message: unknown): Promise<unknown> } => {
      const util = workerUtil as unknown as CrossMessageWorkerUtil;
      return util.createCrossMessageWorker(func, { name: 'CommentLayoutWorker' });
    },
    getInstance(): { post(message: unknown): Promise<unknown> } {
      if (!instance) {
        instance = this.create();
      }
      return instance;
    },
  };
})(Config);

//===END===

export { CommentLayoutWorker };

// /**
//  * findCollisionStartIndexの効率化を適用する前の物
//  */
// let checkCollision_old = function (target, members) {
//   if (target.isInvisible) {
//     return target;
//   }
//
//   let o;
//   let beginLeft = target.beginLeft;
//   for (let i = 0, len = members.length; i < len; i++) {
//     o = members[i];
//
//     // 自分よりうしろのメンバーには影響を受けないので処理不要
//     if (o.id === target.id) {
//       return target;
//     }
//
//     if (beginLeft > o.endRight) {
//       continue;
//     }
//
//
//     if (isConflict(target, o)) {
//       target = moveToNextLine(target, o);
//
//       // ずらした後は再度全チェックするのを忘れずに(再帰)
//       if (!target.isOverflow) {
//         return checkCollision(target, members);
//       }
//     }
//   }
//   return target;
// };
