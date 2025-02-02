import {
  Arg,
  Ctx,
  FieldResolver,
  Mutation,
  Query,
  Resolver,
  Root
} from "type-graphql"
import { Service } from "typedi"
import { Authorization } from "@app/lib/graphql/AuthChecker"
import { Success } from "@app/classes/graphql/generic/success"
import { Context } from "@app/types/graphql/context"
import { BlockedUser } from "@app/models/blockedUser.model"
import { BlockUserInput } from "@app/classes/graphql/blockedUsers/blockUser"
import { User } from "@app/models/user.model"
import { GqlError } from "@app/lib/gqlErrors"
import { SocketNamespaces } from "@app/classes/graphql/SocketEvents"
import {
  PartialUserBase
} from "@app/classes/graphql/user/partialUser"
import { Friend } from "@app/models/friend.model"
import { EXPECTED_OPTIONS_KEY } from "dataloader-sequelize"

@Resolver(BlockedUser)
@Service()
export class BlockedUserResolver {
  @Authorization({
    scopes: ["user.view"],
    userOptional: true
  })
  @Query(() => [BlockedUser])
  blockedUsers(@Ctx() ctx: Context) {
    if (!ctx.user) return []
    return BlockedUser.findAll({
      where: {
        userId: ctx.user.id
      },
      [EXPECTED_OPTIONS_KEY]: ctx.dataloader
    })
  }

  @Authorization({
    scopes: ["user.modify"]
  })
  @Mutation(() => Success)
  async blockUser(
    @Ctx() ctx: Context,
    @Arg("input") input: BlockUserInput
  ): Promise<Success> {
    const user = await User.findByPk(input.userId)
    if (!user) throw new GqlError("USER_NOT_FOUND")
    if (user.id === ctx.user!!.id) throw new GqlError("BLOCK_SELF")
    const exists = await BlockedUser.findOne({
      where: {
        userId: ctx.user!!.id,
        blockedUserId: input.userId
      }
    })
    if (exists) {
      await exists.destroy()
      socket.of(SocketNamespaces.USER).to(ctx.user!!.id).emit("userBlocked", {
        blockedUserId: input.userId,
        blocked: false
      })
      if (!exists.silent) {
        socket
          .of(SocketNamespaces.TRACKED_USERS)
          .to(input.userId)
          .emit("userBlocked", {
            userId: ctx.user!!.id,
            blocked: false
          })
      }
      return { success: true }
    } else {
      const block = await BlockedUser.create({
        userId: ctx.user!!.id,
        blockedUserId: input.userId,
        silent: input.silent
      })
      await Friend.destroy({
        where: {
          userId: ctx.user!!.id,
          friendId: input.userId
        }
      })
      await Friend.destroy({
        where: {
          userId: input.userId,
          friendId: ctx.user!!.id
        }
      })
      if (!input.silent) {
        socket
          .of(SocketNamespaces.TRACKED_USERS)
          .to(input.userId)
          .emit("userBlocked", {
            userId: ctx.user!!.id,
            blocked: true
          })
      }
      socket.of(SocketNamespaces.FRIENDS).to(ctx.user!!.id).emit("request", {
        id: input.userId,
        status: "REMOVED",
        friend: null
      })
      socket.of(SocketNamespaces.FRIENDS).to(input.userId).emit("request", {
        id: ctx.user!!.id,
        status: "REMOVED",
        friend: null
      })
      socket
        .of(SocketNamespaces.USER)
        .to(ctx.user!!.id)
        .emit("userBlocked", {
          ...block.toJSON(),
          blocked: true
        })
      return { success: true }
    }
  }

  @FieldResolver(() => PartialUserBase)
  user(@Root() blockedUser: BlockedUser, @Ctx() ctx: Context) {
    return blockedUser.$get("user", {
      [EXPECTED_OPTIONS_KEY]: ctx.dataloader
    })
  }

  @FieldResolver(() => PartialUserBase)
  blockedUser(@Root() blockedUser: BlockedUser, @Ctx() ctx: Context) {
    return blockedUser.$get("blockedUser", {
      [EXPECTED_OPTIONS_KEY]: ctx.dataloader
    })
  }
}
