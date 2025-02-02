import axios from "@/plugins/axios";
import vuetify from "@/plugins/vuetify";
import { useAdminStore } from "@/store/admin.store";
import { useUserStore } from "@/store/user.store";
import { useAppStore } from "@/store/app.store";
import { useExperimentsStore } from "@/store/experiments.store";
import { useCollectionsStore } from "@/store/collections.store";
import { useWorkspacesStore } from "@/store/workspaces.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendsStore } from "@/store/friends.store";
import { useMailStore } from "@/store/mail.store";
import dayjs from "@/plugins/dayjs";
import validation from "@/plugins/validation";
import { io } from "socket.io-client";
import functions from "@/plugins/functions";
import router from "@/router";
import { useMessagesStore } from "@/store/message.store";

function createSocket(namespace: string) {
  console.log(`[TPU/Socket] Connecting to ${namespace}`);
  const socket = io(`/${namespace}`, {
    auth: {
      token: localStorage.getItem("token")
    },
    transports: ["websocket"],
    reconnection: true,
    path: "/gateway",
    reconnectionAttempts: 99999
  });
  socket.on("connect", () => {
    console.log(`[TPU/Socket] Connected to ${namespace}`);
  });
  socket.on("disconnect", () => {
    console.log(`[TPU/Socket] Disconnected from ${namespace}`);
  });
  return socket;
}

export default function setup(app) {
  const user = useUserStore();
  const core = useAppStore();
  const experiments = useExperimentsStore();
  const collections = useCollectionsStore();
  const workspace = useWorkspacesStore();
  const chat = useChatStore();
  const friends = useFriendsStore();
  const mail = useMailStore();
  const messages = useMessagesStore();
  app.config.globalProperties.axios = axios;
  core.themeProviderDefaults.theme = vuetify.theme.themes.value;
  core.themeProviderDefaults.global = vuetify.defaults.value;
  app.config.globalProperties.$user = user;
  app.config.globalProperties.$app = core;
  app.config.globalProperties.$experiments = experiments;
  app.config.globalProperties.$admin = useAdminStore();
  if (window.location.pathname.startsWith("/slideshow/")) return;
  app.config.globalProperties.$date = dayjs;
  app.config.globalProperties.$collections = collections;
  app.config.globalProperties.$validation = validation;
  app.config.globalProperties.$workspaces = workspace;
  app.config.globalProperties.$chat = chat;
  app.config.globalProperties.$messages = messages;
  app.config.globalProperties.$friends = friends;
  app.config.globalProperties.$mail = mail;
  app.config.globalProperties.$socket = createSocket("");
  app.config.globalProperties.$sockets = {
    chat: createSocket("chat"),
    friends: createSocket("friends"),
    mail: createSocket("mail"),
    user: createSocket("user"),
    pulse: createSocket("pulse"),
    gallery: createSocket("gallery"),
    autoCollects: createSocket("autoCollects"),
    trackedUsers: createSocket("trackedUsers")
  };
  app.config.globalProperties.$functions = functions;

  window.central = {
    user: user.user,
    emit: (platform: string, event: string, data: any) => {
      if (platform === "geo" && event === "history") {
        console.log(data);
      }
    }
  };
}
