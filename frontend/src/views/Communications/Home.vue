<template>
  <v-container class="text-center justify-center">
    <PromoNoContent
      :description="`Chat with other ${$app.site.name} users instantly.`"
      icon="mdi-message-processing-outline"
      :title="`${$app.site.name} Communications`"
    />
  </v-container>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import PromoNoContent from "@/components/Core/PromoNoContent.vue";

export default defineComponent({
  name: "CommunicationsHome",
  components: { PromoNoContent },
  mounted() {
    this.$app.title = "Communications";
    this.$app.railMode = "communications";
  }
});
</script>
