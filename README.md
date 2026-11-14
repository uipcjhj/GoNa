# sky-test — GONA's Sky Adventure 공개 테스트판 (전용 브랜치)

- 공개 주소: https://uipcjhj.github.io/GoNa/sky-test/
- 이 브랜치에는 **빌드된 정적 파일(`sky-test/`)과 배포 워크플로만** 있어요. 게임 소스는 `uipcjhj/-GONA-s-Game-Paradise` 의 `claude/gonas-sky-adventure-dev-ow01sy` 브랜치.
- 이 브랜치를 푸시하면 `.github/workflows/pages-sky-test.yml` 이 **기존 pages.yml 과 똑같이** main(정식 /GoNa/)·dev(/GoNa/dev/)를 빌드·검사한 뒤 `sky-test/` 만 더해 배포해요. 정식·개발 사이트 내용은 바뀌지 않아요.
- 주의: 나중에 GoNa 의 main 이나 dev 가 푸시되면 기존 pages.yml 이 sky-test 없이 다시 배포하므로 테스트판이 사라져요. 그때는 이 브랜치를 다시 실행(Actions → "Pages + Sky test" → Run workflow)하면 복구돼요.
