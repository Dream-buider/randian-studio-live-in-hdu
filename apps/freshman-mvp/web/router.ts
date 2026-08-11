import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import { defineComponent } from 'vue';
import QuestionDeckView from './views/QuestionDeckView.vue';
import WelcomeView from './views/WelcomeView.vue';
import ChatView from './views/ChatView.vue';
import GuideView from './views/GuideView.vue';

const loadRoommateView = async () => defineComponent({
  name: 'RoommateViewLoading',
  template: '<main><p role="status">匹配室友功能正在加载…</p></main>',
});

export interface AppRouterOptions {
  adminEnabled?: boolean;
}

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  options: AppRouterOptions = {},
): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/', name: 'welcome', component: WelcomeView },
    { path: '/questions', name: 'deck', component: QuestionDeckView },
    { path: '/chat', name: 'chat', component: ChatView },
    { path: '/roommates', name: 'roommates', component: loadRoommateView },
    { path: '/guide', name: 'guide', component: GuideView },
  ];
  const buildAllowsAdmin = import.meta.env.MODE !== 'public-trial';
  const adminEnabled = buildAllowsAdmin && (options.adminEnabled ?? true);
  if (adminEnabled) {
    routes.push({
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
    });
  }
  return createRouter({
    history,
    routes,
  });
}

export const router = createAppRouter();
