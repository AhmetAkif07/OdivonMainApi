import { config as loadDotenv } from 'dotenv';
import { bootstrap } from './bootstrap';

loadDotenv();
void bootstrap();
