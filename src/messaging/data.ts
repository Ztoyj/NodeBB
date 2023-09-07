/* eslint-disable import/no-import-module-exports */
import validator from 'validator';

import db from '../database';
import user from '../user';
import utils from '../utils';
import plugins from '../plugins';

const intFields = ['timestamp', 'edited', 'fromuid', 'roomId', 'deleted', 'system'];

interface DataType{
    banned: boolean;
    deleted: boolean;
    uid: number;
}

interface MessageType {
    self: number;
    messageId: number
    ip: string
    system: boolean;
    content: string;
    cleanedContent: string;
    fromuid: number;
    timestamp: number;
    newSet?: boolean;
    fromUser: DataType;
    roomId: string;
    deleted: boolean;
    timestampISO: string;
    editedISO: string;
    edited: boolean;
}

interface MessagingType {
    newMessageCutoff: number;
    getMessagesFields: (mids: string[], fields: string[]) => Promise<MessageType[]>;
    getMessageField: (mid: string, field: string) => Promise<MessageType>;
    getMessageFields: (mid: string, fields: string[]) => Promise<MessageType|null>;
    setMessageField: (mid: string, field: string, content: string) => Promise<void>;
    setMessageFields: (mid: string, data: string) => Promise<void>;
    getMessagesData: (mids: string[], uid: string, roomId: number, isNew: boolean) => Promise<MessageType>;
    parse: (arg0: string, arg1: number, arg2: string, arg3: number, isNew: boolean) => Promise<string>;
}

interface PayloadType{
    message: Promise<MessageType>;
}

async function modifyMessage(message: MessageType, fields: string[], mid: number): Promise<MessageType> {
    if (message) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        db.parseIntFields(message, intFields, fields);
        if (message.hasOwnProperty('timestamp')) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            message.timestampISO = utils.toISOString(message.timestamp) as string;
        }
        if (message.hasOwnProperty('edited')) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            message.editedISO = utils.toISOString(message.edited) as string;
        }
    }

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const payload: PayloadType = await plugins.hooks.fire('filter:messaging.getFields', {
        mid: mid,
        message: message,
        fields: fields,
    }) as PayloadType;

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return payload.message;
}

module.exports = function (Messaging: MessagingType) {
    Messaging.newMessageCutoff = 1000 * 60 * 3;

    Messaging.getMessagesFields = async (mids, fields) => {
        if (!Array.isArray(mids) || !mids.length) {
            return [];
        }

        const keys = mids.map(mid => `message:${mid}`);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const messages: MessageType[] = await db.getObjects(keys, fields) as MessageType[];

        return await Promise.all<MessageType>(messages.map(
            async (message, idx) => modifyMessage(message, fields, parseInt(mids[idx], 10))
        ));
    };

    Messaging.getMessageField = async (mid, field) => {
        const fields = await Messaging.getMessageFields(mid, [field]);
        return fields ? fields[field] : null;
    };

    Messaging.getMessageFields = async (mid, fields) => {
        const messages = await Messaging.getMessagesFields([mid], fields);
        return messages ? messages[0] : null;
    };

    Messaging.setMessageField = async (mid, field, content) => {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObjectField(`message:${mid}`, field, content);
    };

    Messaging.setMessageFields = async (mid, data) => {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObject(`message:${mid}`, data);
    };

    Messaging.getMessagesData = async (mids, uid, roomId, isNew) => {
        let messages = await Messaging.getMessagesFields(mids, []);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        messages = await user.blocks.filter(uid, 'fromuid', messages) as MessageType[];
        messages = messages
            .map((msg, idx) => {
                if (msg) {
                    msg.messageId = parseInt(mids[idx], 10);
                    msg.ip = undefined;
                }
                return msg;
            })
            .filter(Boolean);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const users = await user.getUsersFields(
            messages.map(msg => msg && msg.fromuid),
            ['uid', 'username', 'userslug', 'picture', 'status', 'banned']
        ) as DataType[];

        messages.forEach((message, index) => {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            message.fromUser = users[index];
            message.fromUser.banned = !!message.fromUser.banned;
            message.fromUser.deleted = message.fromuid !== message.fromUser.uid && message.fromUser.uid === 0;

            const self = message.fromuid === parseInt(uid, 10);
            message.self = self ? 1 : 0;

            message.newSet = false;
            message.roomId = String(message.roomId || roomId);
            message.deleted = !!message.deleted;
            message.system = !!message.system;
        });

        messages = await Promise.all(messages.map(async (message) => {
            if (message.system) {
                message.content = validator.escape(String(message.content));
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line
                // @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                message.cleanedContent = utils.stripHTMLTags(utils.decodeHTMLEntities(message.content));
                return message;
            }

            const result = await Messaging.parse(message.content, message.fromuid, uid, roomId, isNew);
            message.content = result;
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            message.cleanedContent = utils.stripHTMLTags(utils.decodeHTMLEntities(result));
            return message;
        }));

        if (messages.length > 1) {
            // Add a spacer in between messages with time gaps between them
            messages = messages.map((message, index) => {
                // Compare timestamps with the previous message, and check if a spacer needs to be added
                if (index > 0 && message.timestamp > messages[index - 1].timestamp + Messaging.newMessageCutoff) {
                    // If it's been 5 minutes, this is a new set of messages
                    message.newSet = true;
                } else if (index > 0 && message.fromuid !== messages[index - 1].fromuid) {
                    // If the previous message was from the other person, this is also a new set
                    message.newSet = true;
                } else if (index === 0) {
                    message.newSet = true;
                }

                return message;
            });
        } else if (messages.length === 1) {
            // For single messages, we don't know the context, so look up the previous message and compare
            const key = `uid:${uid}:chat:room:${roomId}:mids`;
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const index: number = await db.sortedSetRank(key, messages[0].messageId) as number;
            if (index > 0) {
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call */
                const mid: string = await db.getSortedSetRange(key, index - 1, index - 1) as string;
                const fields = await Messaging.getMessageFields(mid, ['fromuid', 'timestamp']);
                if ((messages[0].timestamp > fields.timestamp + Messaging.newMessageCutoff) ||
                    (messages[0].fromuid !== fields.fromuid)) {
                    // If it's been 5 minutes, this is a new set of messages
                    messages[0].newSet = true;
                }
            } else {
                messages[0].newSet = true;
            }
        } else {
            messages = [];
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const data = await plugins.hooks.fire('filter:messaging.getMessages', {
            messages: messages,
            uid: uid,
            roomId: roomId,
            isNew: isNew,
            mids: mids,
        });

        return (data && data.messages) as MessageType;
    };
};
