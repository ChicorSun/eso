import plugin from "../../../lib/plugins/plugin.js";
import cfg from "../../../lib/config/config.js";

let coolingTimeOfVotingrecall = 60; //撤回CD，单位是秒
let numberOfVotingrecalls = 3; //撤回的条数，大于等于2就自动撤回

export class example extends plugin {
  constructor() {
    super({
      name: "ESO:投票撤回",
      dsc: "投票撤回",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^(撤回|撤销)",
          fnc: "recallMessage",
        },
      ],
    });
  }
  async recallMessage(e) {
    console.log(e.self_id);
    //自己不是群主或者管理员没法撤回
    if (!e.group.is_owner && !e.group.is_admin) {
      return false;
    }
    //检查是否存在e.source.seq属性
    if ("source" in e === false) {
      e.reply(`请回复需要撤回的消息`);
      return false;
    }
    let sourceSeq = e.source.seq;
    let sourceMsg = await e.group.getChatHistory(sourceSeq, 1);
    //检查消息是否存在
    if (!sourceMsg) {
      e.reply(`无法获取历史消息`);
      return false;
    }
    sourceMsg = sourceMsg[0];

    let sourceMember = e.group.pickMember(sourceMsg.sender.user_id);

    if (sourceMember.is_owner && sourceMsg.sender.user_id != e.self_id) {
      e.reply(`群主的消息你都敢撤回╭(°A°\`)╮`);
      return false;
    }
    if (sourceMember.is_admin && sourceMsg.sender.user_id != e.self_id) {
      e.reply(`管理员的消息你都敢撤回╭(°A°\`)╮`);
      return false;
    }

    if (e.member.is_owner || e.member.is_admin) {
      await e.group.recallMsg(sourceMsg.message_id);
      await e.reply(`神权发动成功，原消息已被撤回, 并禁言发言者`);
      await e.group.muteMember(sourceMsg.sender.user_id, 300);
      return true;
    }

    let recallerQQ = e.sender.user_id;

    let key = `Yunzai:recallMessage:${e.group_id}`; //redis key
    let time = await redis.get(key); //获取redis中key存不存在
    //如果key还存在，说明还在CD
    if (time) {
      let timeRemaining = await redis.ttl(key); //获取redis里的key的过期时间
      e.reply(`投票撤回还有 ${timeRemaining} 秒 CD`);
      return false;
    }

    let isrecalled = await redis.get(`Yunzai:recall:${e.group_id}:${sourceMsg.message_id}:${recallerQQ}`);
    if (isrecalled) {
      e.reply(`你已经投过票了`);
      return false;
    }
    await redis.set(`Yunzai:recall:${e.group_id}:${sourceMsg.message_id}:${recallerQQ}`, 1, {
      EX: 60,
    });

    let recallKey = `Yunzai:recallMessage:${e.group_id}:${sourceMsg.message_id}`; //redis key

    let recallingNum = 0;
    recallingNum = await redis.get(recallKey); //获取redis中key存不存在
    if (recallingNum >= numberOfVotingrecalls - 1) {
      e.group.recallMsg(sourceMsg.message_id);
      e.reply(`投票结束，原消息已被撤回, 并禁言发言者`);
      await redis.del(recallKey);
      await redis.set(key, 1, { EX: coolingTimeOfVotingrecall });
      await e.group.muteMember(sourceMsg.sender.user_id, 300)
      return true;
    }
    if (recallingNum) {
      await redis.set(recallKey, ++recallingNum, { EX: 60 });
    } else {
      await redis.set(recallKey, 1, { EX: 60 });
      recallingNum = 1;
    }

    //如果投票数小于3，就提示
    e.reply(`正在撤回消息，当前票数 ${recallingNum} ，到达 ${numberOfVotingrecalls} 票将自动撤回`);
    return true;
  }
}

