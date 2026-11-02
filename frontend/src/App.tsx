import { useNetBridge } from './net/useNetBridge'
import { GameScreen } from './screens/GameScreen'

export default function App() {
  useNetBridge()
  return <GameScreen />
}
