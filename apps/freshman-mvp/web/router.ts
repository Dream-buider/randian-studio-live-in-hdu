import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import GoaiDemoView from './views/GoaiDemoView.vue';

export interface AppRouterOptions {
  adminEnabled?: boolean;
}

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  _options: AppRouterOptions = {},
): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/goai-demo' },
    { path: '/goai-demo', name: 'goai-demo', component: GoaiDemoView },
    { path: '/:pathMatch(.*)*', redirect: '/goai-demo' },
  ];
  return createRouter({
    history,
    routes,
  });
}

export const router = createAppRouter();
