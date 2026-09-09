import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:90000,expect:{timeout:15000},fullyParallel:false,workers:1,use:{baseURL:process.env.BASE_URL||'http://localhost:3000',viewport:{width:1440,height:900},screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:[['list'],['html',{open:'never'}]]});
