import { FrappeProvider } from 'frappe-react-sdk'
import BankReconciliation from './pages/BankReconciliation'
import { Toaster } from './components/ui/sonner'
import { ThemeProvider } from 'next-themes'

function App() {

	return (
		<ThemeProvider attribute='class' defaultTheme='light' enableSystem>
			<FrappeProvider
				swrConfig={{
					errorRetryCount: 2
				}}
				socketPort={import.meta.env.VITE_SOCKET_PORT}
				siteName={window.frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME}>
				<BankReconciliation />
				<Toaster richColors theme='light' />
			</FrappeProvider>
		</ThemeProvider>
	)
}

export default App
