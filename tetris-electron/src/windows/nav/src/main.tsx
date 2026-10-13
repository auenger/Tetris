import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initDarkMode } from '@tetris/shared/dark-mode';
import '@tetris/shared/styles/Theme.css';
import './styles/App.css';
import '@tetris/components/TreeView/TreeView.css';
import App from './App';
import { AnalyticsProvider } from '../../shared/PostHogProvider';

initDarkMode();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
	<StrictMode>
		<AnalyticsProvider>
			<App />
		</AnalyticsProvider>
	</StrictMode>,
);
