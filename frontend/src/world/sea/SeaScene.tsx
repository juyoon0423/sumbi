import { Coast } from './Coast'
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
      <Seaweed />
      <SeafoodField />
      <Ocean />
      <Underwater />
    </>
  )
}
