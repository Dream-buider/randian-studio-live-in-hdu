import {
  createRouter,
  createWebHistory,
  type Router,
  type RouterHistory,
} from 'vue-router';
import QuestionDeckView from './views/QuestionDeckView.vue';
import ChatView from './views/ChatView.vue';
import AdminView from './views/AdminView.vue';

export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'deck', component: QuestionDeckView },
      { path: '/chat', name: 'chat', component: ChatView },
      { path: '/admin', name: 'admin', component: AdminView },
    ],
  });
}

export const router = createAppRouter();
