import { Container, Service } from "typedi"
import { CacheService } from "@app/services/cache.service"
import { User } from "@app/models/user.model"
import { Invite } from "@app/models/invite.model"
import Mailgen from "mailgen"
import nodemailer from "nodemailer"
import { Announcement } from "@app/models/announcement.model"
import { Experiment } from "@app/models/experiment.model"
import { CoreService } from "@app/services/core.service"
import { Feedback } from "@app/models/feedback.model"
import { Upload } from "@app/models/upload.model"
import path from "path"
import * as fs from "fs"
import { Friend } from "@app/models/friend.model"
import Errors from "@app/lib/errors"
import { Collection } from "@app/models/collection.model"
import { AutoCollectApproval } from "@app/models/autoCollectApproval.model"
import { Op } from "sequelize"
import { Chat } from "@app/models/chat.model"
import { Badge } from "@app/models/badge.model"
import { BadgeAssociation } from "@app/models/badgeAssociation.model"
import { AutoCollectRule } from "@app/models/autoCollectRule.model"
import { ChatAssociation } from "@app/models/chatAssociation.model"
import { LegacyUser } from "@app/models/legacyUser.model"
import { Message } from "@app/models/message.model"
import { CacheType } from "@app/enums/admin/CacheType"
import { Domain } from "@app/models/domain.model"
import { OauthApp } from "@app/models/oauthApp.model"
import cryptoRandomString from "crypto-random-string"
import utils from "@app/lib/utils"
import { OauthUser } from "@app/models/oauthUser.model"
import { Session } from "@app/models/session.model"
import { OauthSave } from "@app/models/oauthSave.model"
import { partialUserBase } from "@app/classes/graphql/user/partialUser"
import SMTPTransport from "nodemailer/lib/smtp-transport"
import { UserUtilsService } from "@app/services/userUtils.service"

const inviteParams = {
  include: [
    {
      model: User,
      as: "user",
      attributes: ["id", "username", "avatar", "email"]
    },
    {
      model: User,
      as: "invited",
      attributes: ["id", "username", "avatar", "email"]
    }
  ],
  attributes: [
    "id",
    "email",
    "adminId",
    "inviteKey",
    "status",
    "userId",
    "registerUserId",
    "createdAt",
    "updatedAt"
  ]
}

@Service()
export class AdminService {
  constructor(private readonly cacheService: CacheService) {}

  async getFeedback() {
    return await Feedback.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: partialUserBase
        }
      ],
      order: [["createdAt", "DESC"]]
    })
  }

  async createAnnouncement(
    content: string,
    userId: number
  ): Promise<Announcement> {
    return await Announcement.create({
      content,
      userId
    })
  }

  async editAnnouncement(
    id: number,
    content: string,
    userId: number
  ): Promise<Announcement> {
    const announcement = await Announcement.findOne({
      where: {
        id
      }
    })
    if (!announcement || announcement.userId !== userId) throw Errors.NOT_FOUND
    await announcement.update({
      content
    })
    return announcement
  }

  async deleteAnnouncement(id: number): Promise<boolean> {
    const announcement = await Announcement.findOne({
      where: {
        id
      }
    })
    if (!announcement) throw Errors.NOT_FOUND
    await announcement.destroy()
    return true
  }

  async getInvites() {
    return Invite.findAll({
      ...inviteParams
    })
  }

  async actOnInvite(
    inviteKey: string,
    action: "accepted" | "rejected"
  ): Promise<Invite | null> {
    await Invite.update(
      {
        status: action
      },
      {
        where: {
          inviteKey
        }
      }
    )
    return await Invite.findOne({
      where: {
        inviteKey
      },
      ...inviteParams
    })
  }

  async getUsers() {
    return User.findAll({
      attributes: {
        exclude: ["emailToken", "storedStatus"]
      }
    })
  }

  async getStats() {
    //TODO
    return {
      tpu: {
        users: await User.count(),
        uploads: await Upload.count(),
        friends: await Friend.count(),
        invites: await Invite.count(),
        feedback: await Feedback.count(),
        announcements: await Announcement.count(),
        experiments: await Experiment.count(),
        collections: await Collection.count(),
        shareLinks: await Collection.count({
          where: {
            shareLink: {
              [Op.ne]: null
            }
          }
        }),
        autoCollects: await AutoCollectApproval.count(),
        chats: await Chat.count(),
        uploadsSize: await Upload.sum("fileSize")
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    }
  }

  async purgeCache(type: CacheType) {
    const cacheService = Container.get(CacheService)
    switch (type) {
      case CacheType.everything:
        await cacheService.refreshState()
        await cacheService.generateCollectionCache()
        await cacheService.generateShareLinkCache()
        return true
      case CacheType.state:
        await cacheService.refreshState()
        return true
      case CacheType.collections:
        await cacheService.generateCollectionCache()
        return true
      case CacheType.sharelinks:
        await cacheService.generateShareLinkCache()
        return true
      case CacheType.autocollects:
        await cacheService.generateAutoCollectCache()
        return true
      case CacheType.invites:
        await redis.del("invites")
        return true
      case CacheType.chats:
        await cacheService.generateChatsCache()
        return true
      case CacheType.insights:
        await cacheService.generateInsightsCache()
        return true
      case CacheType.userstats:
        await cacheService.generateUserStatsCache()
        return true
      case CacheType.lastfm:
        console.log("[AdminService] Purging lastfm cache")
        await redis.del("providers:lastfm:*")
        return true
      case CacheType.mal:
        console.log("[AdminService] Purging mal cache")
        await redis.del("providers:mal:*")
        return true
      case CacheType.trackedUsers:
        const users = await User.findAll({
          attributes: ["id"]
        })
        const userService = Container.get(UserUtilsService)
        for (const user of users) {
          await userService.trackedUserIds(user.id, true)
        }
        return true
      case CacheType.users:
        await cacheService.generateUserCache()
        return true
      default:
        return false
    }
  }

  async purgeUserCache(id: number) {
    await this.cacheService.generateCollectionCacheForUser(id)
    return true
  }

  async sendEmail(
    mail: Mailgen.Content,
    email: string,
    subject: string,
    customConfig?: {
      host: string
      port: number
      secure: boolean
      username: string
      password: string
      from: string
    }
  ): Promise<SMTPTransport.SentMessageInfo | true> {
    console.log("[AdminService] Sending email to", email)
    let mailGenerator = new Mailgen({
      theme: "cerberus",
      product: {
        name: config.siteName,
        link: config.hostnameWithProtocol,
        logo: config.officialInstance
          ? "https://i.troplo.com/i/4ddf963706a3.svg"
          : undefined
      }
    })
    let emailBody = mailGenerator.generate(mail)
    let emailText = mailGenerator.generatePlaintext(mail)
    let transporter = nodemailer.createTransport({
      host: customConfig?.host || config.email.host,
      port: customConfig?.port || config.email.port,
      secure: customConfig?.secure || config.email.secure,
      auth: {
        user: customConfig?.username || config.email.username,
        pass: customConfig?.password || config.email.password
      }
    })
    return await transporter.sendMail({
      from: customConfig?.from || config.email.from,
      to: email,
      subject: subject,
      text: emailText,
      html: emailBody
    })
  }

  async createExperimentOverrides(
    currentExperiments: Record<
      string,
      string | number | boolean | undefined | null
    >,
    overrides: { [key: string]: string | number | boolean | undefined | null },
    userId: number,
    dev: boolean = false
  ) {
    const experiments = Object.entries(overrides).reduce(
      (acc: Record<string, any>, [name, value]: any) => {
        try {
          if (name === "meta") return acc
          const val = JSON.parse(<string>value)
          if (val !== currentExperiments[name] && value !== "destroy") {
            acc[name] = val
          }
          return acc
        } catch {
          if (value !== currentExperiments[name] && value !== "destroy") {
            acc[name] = value
          }
          return acc
        }
      },
      {}
    )
    const experimentsToDelete = Object.entries(overrides).reduce(
      (acc, [name, value]) => {
        if (value === "destroy") {
          acc.push(name)
        }
        return acc
      }
    )
    for (const experiment of experimentsToDelete) {
      await Experiment.destroy({
        where: {
          key: experiment,
          userId
        }
      })
    }

    for (const [key, value] of Object.entries(experiments)) {
      await Experiment.create({
        key,
        value: JSON.stringify(value),
        userId
      })
    }
    const coreService = Container.get(CoreService)
    return await coreService.getUserExperiments(userId, dev)
  }

  async exportCSVUploads() {
    let uploads = await Upload.findAll({
      attributes: ["createdAt", "id"],
      order: [["createdAt", "DESC"]],
      raw: true
    })

    let data = uploads.reduce((acc: any, upload) => {
      const date = dayjs(upload.createdAt).format("YYYY-MM-DD")
      if (date === "Invalid Date") return acc
      if (!acc[date]) {
        acc[date] = 1
      } else {
        acc[date]++
      }
      return acc
    })

    return Object.entries(data)
      .map(([date, count]) => `${date},${count}`)
      .join("\n")
  }

  async getServices() {
    // get all typedi service functions
    const container = Container as any
    const services = container?.globalInstance?.services
    if (!services) return []
    const serviceNames = Object.keys(services)
    const serviceFunctions = serviceNames.map((name) => {
      return services[name]
    })
    // get all typedi service names
    let serviceNamesWithTypes = serviceFunctions.map((service) => {
      return {
        name: service.type.name,
        functions: [] as (string[] | null)[]
      }
    })
    for (const service of serviceNamesWithTypes) {
      // contains controller, application or server
      if (
        service.name.toLowerCase().includes("controller") ||
        service.name.toLowerCase().includes("application") ||
        service.name.toLowerCase().includes("server")
      )
        continue
      const name =
        service.name.charAt(0).toLowerCase() +
        service.name.slice(1).replace("Service", ".service")
      const file = fs.readFileSync(
        path.join(__dirname, `../../app/services/${name}.ts`),
        "utf8"
      )
      // get the function names and also provide the parameters like {"name": "yes", "params": {"id": "number"}}]}
      let functionNames
      try {
        functionNames = file
          .split("\n")
          .filter((line) => line.includes("async"))
          .map((line) => {
            const functionName = line.split("async ")[1].split("(")[0]
            const params = line
              .split("(")[1]
              .split(")")[0]
              .split(",")
              .map((param) => {
                const name = param.split(":")[0]?.trim()
                const type = param.split(":")[1]?.trim()
                return {
                  name,
                  type
                }
              })
            return {
              name: functionName,
              params
            }
          })
      } catch {}
      if (!functionNames) continue
      // @ts-ignore
      service.functions = functionNames
    }
    return serviceNamesWithTypes
  }

  //dev
  async devAcceptFriends() {
    await Friend.update(
      {
        status: "accepted"
      },
      {
        where: {}
      }
    )
  }

  async updatePlanId(userId: number, planId: number) {
    const user = await User.findByPk(userId)
    if (!user) throw Errors.USER_NOT_FOUND
    if (userId === 6 && planId === 6 && config.officialInstance) {
      throw Errors.HANDLED_BY_PAYMENT_PROVIDER
    }
    await User.update(
      {
        planId
      },
      {
        where: {
          id: userId
        }
      }
    )
    return true
  }

  async updateBanned(userId: number, banned: boolean) {
    const user = await User.findByPk(userId)
    if (!user) throw Errors.USER_NOT_FOUND
    if (user.administrator || user.moderator) throw Errors.MANUAL_BAN_REQUIRED
    await User.update(
      {
        banned
      },
      {
        where: {
          id: userId
        }
      }
    )
    return true
  }

  async createBadge(
    name: string,
    description: string,
    icon: string,
    color: string,
    tooltip: string,
    image: string
  ) {
    return await Badge.create({
      name,
      description,
      icon,
      color,
      tooltip,
      image
    })
  }

  async addUsersToBadge(userIds: number[], badgeId: number) {
    for (const userId of userIds) {
      await BadgeAssociation.create({
        userId,
        badgeId
      })
    }
    return true
  }

  async getBadges() {
    return await Badge.findAll({
      include: [
        {
          model: User,
          as: "users",
          attributes: partialUserBase
        }
      ]
    })
  }

  async updateBadge(badge: Badge) {
    await Badge.update(
      {
        ...badge
      },
      {
        where: {
          id: badge.id
        }
      }
    )
    return true
  }

  async deleteBadge(badgeId: number) {
    await Badge.destroy({
      where: {
        id: badgeId
      }
    })
    await BadgeAssociation.destroy({
      where: {
        badgeId
      }
    })
    return true
  }

  async removeUsersFromBadge(userIds: number[], badgeId: number) {
    for (const userId of userIds) {
      await BadgeAssociation.destroy({
        where: {
          userId,
          badgeId
        }
      })
    }
    return true
  }

  // AutoCollect
  async getAutoCollectRules() {
    return await User.findAll({
      attributes: partialUserBase,
      include: [
        {
          model: AutoCollectRule,
          as: "autoCollectRules"
        }
      ]
    })
  }

  // --SCRIPTS--
  async scriptFindChats(
    type: undefined | "group" | "direct" | "channel" = undefined
  ) {
    return await Chat.findAll({
      where: {
        type
      },
      include: [
        {
          model: ChatAssociation,
          as: "users",
          attributes: [
            "id",
            "userId",
            "user",
            "rank",
            "legacyUserId",
            "lastRead",
            "createdAt",
            "updatedAt"
          ],
          include: [
            {
              model: User,
              as: "tpuUser",
              attributes: partialUserBase
            },
            {
              model: LegacyUser,
              as: "legacyUser",
              attributes: partialUserBase
            }
          ]
        }
      ]
    })
  }

  async scriptColubrinaGroupOwner() {
    const chats = await this.scriptFindChats("group")
    for (const chat of chats) {
      // if the chat has no owners
      if (!chat.users.find((user) => user.rank === "owner")) {
        // get the owner
        const owner = chat.users.find(
          (user) => user.tpuUser?.id === chat.userId
        )
        if (owner?.tpuUser) {
          await ChatAssociation.update(
            {
              rank: "owner"
            },
            {
              where: {
                id: owner.id
              }
            }
          )
        } else {
          // make a random admin the owner
          const admin = chat.users.find((user) => user.rank === "admin")
          if (admin?.tpuUser) {
            await ChatAssociation.update(
              {
                rank: "owner"
              },
              {
                where: {
                  id: admin.id
                }
              }
            )
          } else {
            const user = chat.users.find((user) => user.rank === "member")
            if (user?.tpuUser) {
              await ChatAssociation.update(
                {
                  rank: "owner"
                },
                {
                  where: {
                    id: user.id
                  }
                }
              )
            } else {
              console.log("no users in chat", chat.id)
            }
          }
        }
      }
    }
    console.log("OK, clearing cache")
    this.purgeCache(6)
  }

  async scriptColubrinaDMOwners() {
    const chats = await this.scriptFindChats("direct")
    for (const chat of chats) {
      // if any of the chats have users of rank admin or owner, set them to member
      for (const user of chat.users) {
        if (user.rank === "admin" || user.rank === "owner") {
          console.log(`changing ${user.user?.username} to member`)
          await ChatAssociation.update(
            {
              rank: "member"
            },
            {
              where: {
                id: user.id
              }
            }
          )
        }
      }
    }
    console.log("OK, clearing cache")
    this.purgeCache(6)
  }

  async scriptColubrinaDMMerge() {
    const chats = await this.scriptFindChats("direct")
    // if any of the chats have the same users, merge them
    for (const chat of chats) {
      for (const chat2 of chats) {
        if (chat.id === chat2.id) continue
        const users = chat.users.map((user) => user.tpuUser?.id)
        const users2 = chat2.users.map((user) => user.tpuUser?.id)
        if (users.length === users2.length) {
          if (users.every((user) => users2.includes(user))) {
            // if the users or users2 contains undefined, skip
            //@ts-ignore
            if (users.includes(undefined) || users2.includes(undefined))
              continue
            if (users.length !== 2 || users2.length !== 2) continue
            // delete the other chat from array
            chats.splice(chats.indexOf(chat2), 1)
            // merge the chats
            console.log(
              `merging ${chat.id} and ${chat2.id}, Users: ${users}, Users2: ${users2}`
            )
            await ChatAssociation.destroy({
              where: {
                chatId: chat2.id
              }
            })
            await Message.update(
              {
                chatId: chat.id
              },
              {
                where: {
                  chatId: chat2.id
                }
              }
            )
            await Chat.destroy({
              where: {
                id: chat2.id
              }
            })
          }
        }
      }
    }
    console.log("OK, clearing cache")
    this.purgeCache(6)
  }

  async scriptColubrinaDMIntents() {
    const chats = await this.scriptFindChats("direct")
    for (const chat of chats) {
      if (chat.intent?.length) continue
      const users = chat.users.map((user) => user.tpuUser?.id)
      //@ts-ignore
      if (users.length !== 2 || users.includes(undefined)) continue
      users.sort((a, b) => a - b)
      console.log(`setting intent for ${chat.id} to ${users}`)
      // set the intent
      await Chat.update(
        {
          intent: users.join("-")
        },
        {
          where: {
            id: chat.id
          }
        }
      )
    }
    console.log("OK, clearing cache")
    this.purgeCache(6)
  }

  async deleteCommunicationsMessage(messageId: number) {
    const message = await Message.findOne({
      where: {
        id: messageId
      }
    })

    if (!message) throw Errors.MESSAGE_NOT_FOUND

    await message.destroy()
  }

  async updateDomain(domain: Partial<Domain>) {
    const domainInstance = await Domain.findOne({
      where: {
        id: domain.id
      }
    })

    if (!domainInstance) throw Errors.DOMAIN_NOT_FOUND

    await domainInstance.update({
      domain: domain.domain
    })
  }

  async createDomain(name: string, userId: number) {
    return await Domain.create({
      domain: name,
      active: true,
      DNSProvisioned: true,
      userId
    })
  }

  async deleteDomain(domainId: number) {
    if (domainId === 1) throw Errors.CANNOT_DELETE_DEFAULT
    return await Domain.destroy({
      where: {
        id: domainId
      }
    })
  }

  async verify(userId: number, emailVerified: boolean) {
    const user = await User.findOne({
      where: {
        id: userId
      }
    })

    if (!user || user.administrator || user.moderator)
      throw Errors.USER_NOT_FOUND

    await user.update({
      emailVerified
    })
  }

  async getOauth() {
    return await OauthApp.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: partialUserBase
        }
      ],
      order: [["createdAt", "DESC"]]
    })
  }

  async createOauth(body: Partial<OauthApp>, userId: number) {
    return await OauthApp.create({
      name: body.name,
      icon: body.icon,
      // convert the name to a slug shortcode
      shortCode:
        body.name?.toLowerCase().replace(/ /g, "-") +
        "-" +
        cryptoRandomString({ length: 5 }),
      verified: body.verified,
      redirectUri: body.redirectUri,
      secret: await utils.generateAPIKey("oauth"),
      description: body.description,
      scopes: body.scopes,
      userId: userId,
      private: body.private
    })
  }

  async getOauthById(id: string, userId?: number, gql?: boolean) {
    const app = await OauthApp.findOne({
      where: {
        id
      },
      // include secret override
      attributes: {
        include: ["secret"]
      },
      include: !gql
        ? [
            {
              model: User,
              as: "user",
              attributes: partialUserBase
            },
            {
              model: OauthUser,
              as: "oauthUsers",
              include: [
                {
                  model: User,
                  as: "user",
                  attributes: partialUserBase
                }
              ]
            }
          ]
        : []
    })
    if (app && userId && userId !== app.userId) {
      const check = await OauthUser.findOne({
        where: {
          oauthAppId: app.id,
          userId,
          manage: true
        }
      })
      if (check) return app
      return null
    }
    return app
  }

  async updateOauth(body: Partial<OauthApp>, userId: number) {
    const app = await this.getOauthById(body.id || "", userId, true)
    if (!app) throw Errors.NOT_FOUND
    if (body.private && !app.private) {
      const manualUsers = await OauthUser.findAll({
        where: {
          oauthAppId: app.id
        },
        attributes: ["userId"]
      })
      const ids = [...manualUsers.map((user) => user.userId), app.userId]
      await Session.destroy({
        where: {
          oauthAppId: app.id,
          type: "oauth",
          userId: {
            [Op.notIn]: ids
          }
        }
      })
    }
    await app.update({
      name: body.name,
      icon: body.icon,
      verified: body.verified,
      redirectUri: body.redirectUri,
      description: body.description,
      scopes: body.scopes,
      private: body.private
    })
  }

  async createOauthUser(
    appId: string,
    username: string,
    userId: number,
    manage: boolean = false
  ) {
    const app = await this.getOauthById(appId, userId)
    if (!app) throw Errors.NOT_FOUND
    const user = await User.findOne({
      where: {
        username
      }
    })
    if (!user || user.id === userId) throw Errors.USER_NOT_FOUND
    const existence = await OauthUser.findOne({
      where: {
        userId: user.id,
        oauthAppId: app.id
      }
    })
    if (existence) {
      await existence.destroy()
      await Session.destroy({
        where: {
          oauthAppId: app.id,
          userId: user.id,
          type: "oauth"
        }
      })
      return existence
    }
    return await OauthUser.create({
      userId: user.id,
      oauthAppId: app.id,
      active: true,
      manage
    })
  }

  async resetOauthSecret(appId: string, userId: number) {
    const app = await this.getOauthById(appId, userId)
    if (!app) throw Errors.NOT_FOUND
    const secret = await utils.generateAPIKey("oauth")
    await app.update({
      secret
    })
    return {
      secret
    }
  }

  async deleteOauth(appId: string, userId: number) {
    const app = await this.getOauthById(appId, userId)
    if (!app) throw Errors.NOT_FOUND
    await app.destroy()
    await OauthUser.destroy({
      where: {
        oauthAppId: app.id
      }
    })
    await Session.destroy({
      where: {
        oauthAppId: app.id,
        type: "oauth"
      }
    })
    await OauthSave.destroy({
      where: {
        oauthAppId: app.id
      }
    })
  }
}
