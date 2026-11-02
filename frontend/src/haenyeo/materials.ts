import { MeshStandardMaterial } from 'three'

// 레퍼런스처럼 광택 없는 소프트 비닐/점토 느낌 (roughness 높게, 금속성 0)
export const MAT = {
  skin: new MeshStandardMaterial({ color: '#f6caa6', roughness: 0.85 }),
  suit: new MeshStandardMaterial({ color: '#2a2e35', roughness: 0.7 }),
  towel: new MeshStandardMaterial({ color: '#f4efe4', roughness: 0.95 }),
  cheek: new MeshStandardMaterial({ color: '#f39f98', roughness: 0.9 }),
  eye: new MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.4 }),
  mouth: new MeshStandardMaterial({ color: '#8f4b47', roughness: 0.8 }),
  goggleFrame: new MeshStandardMaterial({ color: '#34495c', roughness: 0.6 }),
  goggleGlass: new MeshStandardMaterial({
    color: '#c4ecf7',
    roughness: 0.15,
    transparent: true,
    opacity: 0.5,
  }),
  fin: new MeshStandardMaterial({ color: '#2f5569', roughness: 0.7 }),
  tewak: new MeshStandardMaterial({ color: '#f5862b', roughness: 0.6 }),
  tewakBand: new MeshStandardMaterial({ color: '#7a3f1c', roughness: 0.9 }),
  net: new MeshStandardMaterial({ color: '#40603f', roughness: 1, wireframe: true }),
}
