import {
  Table,
  Column,
  Model,
  //BelongsTo,
  Default,
  AllowNull,
  DefaultScope,
  BelongsTo,
  DataType,
  Unique,
  IsEmail,
  Length,
  HasOne,
  HasMany,
  BelongsToMany
} from "sequelize-typescript"
import { Plan } from "@app/models/plan.model"
import { Theme } from "@app/models/theme.model"
import { Domain } from "@app/models/domain.model"
import { Subscription } from "@app/models/subscription.model"
import { Experiment } from "@app/models/experiment.model"
import { Badge } from "@app/models/badge.model"
import { BadgeAssociation } from "@app/models/badgeAssociation.model"
import { AutoCollectRule } from "@app/models/autoCollectRule.model"
import { FriendNickname } from "@app/models/friendNickname"

@DefaultScope(() => ({
  attributes: {
    exclude: [
      "password",
      "totpSecret",
      "passwordResetEnabled",
      "passwordResetCode",
      "passwordResetExpiry",
      "alternatePasswords",
      "mailToken"
    ]
  }
}))
@Table
export class User extends Model {
  @AllowNull(false)
  @Unique
  @Length({
    msg: "Length of your username must be between 2-16 characters.",
    min: 2,
    max: 16
  })
  @Column
  username: string

  @AllowNull(false)
  @Unique
  @IsEmail
  @Column
  email: string

  @Column
  password: string

  @AllowNull(false)
  @Default(false)
  @Column
  passwordResetEnabled: boolean

  @Column
  passwordResetCode: string

  @Column({
    type: DataType.DATE
  })
  passwordResetExpiry: Date

  @Length({
    msg: "Length of your description must be between 0-255 characters.",
    min: 0,
    max: 255
  })
  @Column
  description?: string

  @Default(false)
  @Column
  administrator: boolean

  @Default(true)
  @Column
  darkTheme: boolean

  @Default(false)
  @Column
  emailVerified: boolean

  @Default(false)
  @Column
  banned: boolean

  @Column
  inviteId?: number

  @Default({
    enabled: false,
    color: "#0190ea",
    siteName: "TroploPrivateUploader",
    siteURL: "https://images.flowinity.com",
    author: "",
    authorURL: null,
    title: "[attachment.name]",
    description: "Uploaded by [user.username]",
    customFields: []
  })
  @Column({
    type: DataType.JSON
  })
  openGraph: OpenGraph

  @Default(false)
  @Column
  discordPrecache: boolean

  @AllowNull
  @Column
  avatar?: string

  @Column
  subdomainId?: number

  @Default(1)
  @Column
  domainId: number

  @Default(false)
  @Column
  totpEnable: boolean

  @AllowNull
  @Column
  totpSecret?: string

  @Default(0)
  @Column
  quota: bigint

  @Default(false)
  @Column
  uploadNameHidden: boolean

  @Default(false)
  @Column
  invisibleURLs: boolean

  @Default(false)
  @Column
  moderator: boolean

  @Default(1)
  @Column
  subscriptionId: number

  @AllowNull
  @Column
  fakePath?: string

  @Default(1)
  @Column
  themeId: number

  @Default(12)
  @Column({
    validate: {
      min: 12,
      max: 72
    }
  })
  itemsPerPage: number

  @Column
  banner?: string

  @Column({
    type: DataType.JSON,
    defaultValue: []
  })
  alternatePasswords: AlternatePassword[]

  @Column({
    type: DataType.ENUM("online", "idle", "offline", "busy")
  })
  status: "online" | "idle" | "offline" | "busy"

  @Column({
    type: DataType.ENUM("online", "idle", "busy", "invisible")
  })
  storedStatus: "online" | "idle" | "busy" | "invisible"

  @Column({
    type: DataType.ENUM("celsius", "fahrenheit", "kelvin"),
    defaultValue: "celsius"
  })
  weatherUnit: "celsius" | "fahrenheit" | "kelvin"

  @Column
  emailToken?: string

  @Column
  mailToken?: string

  @BelongsTo(() => Plan, "planId")
  plan: Plan

  @BelongsTo(() => Theme, "themeId")
  theme: Theme

  @BelongsTo(() => Domain, "domainId")
  domain: Domain

  @HasOne(() => Subscription, "userId")
  subscription: Subscription

  @HasMany(() => Experiment, "userId")
  experiments: Experiment[]

  @BelongsToMany(() => Badge, () => BadgeAssociation, "userId", "badgeId")
  badges: Badge[]

  @HasMany(() => AutoCollectRule, "userId")
  autoCollectRules: AutoCollectRule[]

  scopes: string

  stats: object

  @HasOne(() => FriendNickname, "friendId")
  nickname: FriendNickname
}
