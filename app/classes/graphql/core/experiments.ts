import { Field, ObjectType } from "type-graphql"
import { Announcement } from "@app/models/announcement.model"
import { DateType } from "@app/classes/graphql/serializers/date"

@ObjectType()
export class ExperimentType {
  @Field()
  id: string
  @Field()
  value: boolean
  @Field({
    nullable: true
  })
  description: string
  @Field(() => DateType, {
    nullable: true
  })
  createdAt: Date
  @Field({
    nullable: true
  })
  refresh?: boolean
}
