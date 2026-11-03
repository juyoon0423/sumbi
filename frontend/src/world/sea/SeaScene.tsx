import { Bulteok } from '../bulteok/Bulteok'
import { Coast } from './Coast'
import { SeaFriends } from './friends/SeaFriends'
import { Ocean } from './Ocean'
import { SeafoodField } from './seafood/SeafoodField'
import { Seaweed } from './Seaweed'
import { SkyAndLight } from './SkyAndLight'
import { Terrain } from './Terrain'
import { Underwater } from './Underwater'

export function SeaScene() {
  return (
    <>
      <SkyAndLight />
      <Terrain />
      <Coast />
      <Bulteok />
      <Seaweed />
      <SeafoodField />
      <SeaFriends />
      <Ocean />
      <Underwater />
    </>
  )
}
