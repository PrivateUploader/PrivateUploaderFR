import { gql } from "@apollo/client";

export const FriendsQuery = gql`
  query Friends {
    friends {
      id
      status
      userId
      friendId
      user {
        username
        id
        createdAt
        administrator
        moderator
        avatar
        status
      }
    }
    trackedUsers {
      username
      id
      createdAt
      administrator
      moderator
      avatar
      blocked
      status
      nameColor
      bot
      nickname {
        nickname
      }
    }
    blockedUsers {
      id
      userId
      createdAt
      updatedAt
      blockedUserId
      silent
    }
  }
`;
