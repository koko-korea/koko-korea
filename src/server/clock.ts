/** 서버 시각. 테스트에서 시간을 조작할 수 있도록 한곳에 모아 둔다. */
export const clock = {
  now: (): number => Date.now(),
};
