/** 개발 서버에서 ?debug=1 이면 fps·품질 표시 (배포 빌드에선 늘 false 라 표시 코드가 빠짐) */
export const debugOn = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1'
