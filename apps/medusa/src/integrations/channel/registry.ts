import { MetaMessengerChannel } from "../meta/messenger";
import type { MessageChannel } from "./channel";
import { SandboxChannel } from "./sandbox";

const channels = new Map<string, MessageChannel>();

export const registerMessageChannel = (channel: MessageChannel): void => {
  channels.set(channel.code, channel);
};

export const DEFAULT_CHANNEL = "MESSENGER";

/** `CHANNEL_SANDBOX=true` swaps in the recording sandbox (dev/CI). */
export const getMessageChannel = (
  code: string = DEFAULT_CHANNEL
): MessageChannel => {
  const existing = channels.get(code);
  if (existing) {
    return existing;
  }
  let created: MessageChannel;
  if (process.env.CHANNEL_SANDBOX === "true") {
    created = new SandboxChannel(code);
  } else if (code === "MESSENGER") {
    created = MetaMessengerChannel.fromEnv();
  } else {
    throw new Error(`No message channel registered for ${code}`);
  }
  channels.set(code, created);
  return created;
};
