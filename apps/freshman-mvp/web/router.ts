import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import QuestionDeckView from './views/QuestionDeckView.vue';
import WelcomeView from './views/WelcomeView.vue';
import ChatView from './views/ChatView.vue';
import GuideView from './views/GuideView.vue';
import AgentDemoView from './views/AgentDemoView.vue';
import GoaiDemoView from './views/GoaiDemoView.vue';

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
    { path: '/guide', name: 'guide', component: GuideView },
    { path: '/agent', name: 'agent', component: AgentDemoView },
    { path: '/goai-demo', name: 'goai-demo', component: GoaiDemoView },
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
