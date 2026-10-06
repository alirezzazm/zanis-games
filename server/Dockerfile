# Game server image. Build from the repository root (the practice game in web/ is served at /play/):
#   docker build -f server/Dockerfile -t zanis-games .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY server/Directory.Build.props server/Zanis.Games.slnx ./
COPY server/src/Zanis.Games.Api/Zanis.Games.Api.csproj src/Zanis.Games.Api/
COPY server/tests/Zanis.Games.Api.Tests/Zanis.Games.Api.Tests.csproj tests/Zanis.Games.Api.Tests/
RUN dotnet restore Zanis.Games.slnx
COPY server/src src
COPY server/tests tests
# The image is only built when the tests pass.
RUN dotnet test tests/Zanis.Games.Api.Tests -c Release --no-restore
RUN dotnet publish src/Zanis.Games.Api -c Release --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
COPY web/ ./wwwroot/play/
RUN mkdir -p /data && chown app:app /data
ENV ASPNETCORE_URLS=http://+:8080 \
    Zanis__DataDirectory=/data
VOLUME /data
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Zanis.Games.Api.dll"]
