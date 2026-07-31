import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import QuestionDeckView from './views/QuestionDeckView.vue';
import ChatView from './views/ChatView.vue';

export interface AppRouterOptions {
  adminEnabled?: boolean;
}

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  options: AppRouterOptions = {},
): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/', name: 'deck', component: QuestionDeckView },
    { path: '/chat', name: 'chat', component: ChatView },
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
