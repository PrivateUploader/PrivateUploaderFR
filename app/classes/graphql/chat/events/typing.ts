import { Field, ObjectType } from "type-graphql"
import {
  PartialUserFriend
} from "@app/classes/graphql/user/partialUser"

@ObjectType()
export class ChatTypingEvent {
  @Field()
  chatId: number
  @Field(() => PartialUserFriend)
  user: PartialUserFriend
  @Field({
    nullable: true
  })
  expires: number
}
