import { User } from "@/models/user";
import { ChatAssociation } from "@/models/chatAssociation";
import { Message } from "@/models/message";

export interface Chat {
  id: number;
  type: "direct" | "group" | "channel";
  name: string;
  userId: number;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
  legacyUserId: number;
  user: User;
  legacyUser: User;
  association: ChatAssociation;
  users: ChatAssociation[];
  messages: Message[];
}
