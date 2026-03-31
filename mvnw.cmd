@REM Maven Wrapper script for Windows
@REM Downloads Maven if not present

@echo off
setlocal

set MAVEN_PROJECTBASEDIR=%~dp0
set WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar
set WRAPPER_PROPERTIES=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.properties

if exist "%WRAPPER_JAR%" goto runWrapper

echo Downloading Maven Wrapper...
set WRAPPER_URL=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar

powershell -Command "Invoke-WebRequest -Uri '%WRAPPER_URL%' -OutFile '%WRAPPER_JAR%'"

:runWrapper
if not "%JAVA_HOME%"=="" goto javaHomeSet
set JAVACMD=java
goto runJava

:javaHomeSet
set JAVACMD=%JAVA_HOME%\bin\java

:runJava
"%JAVACMD%" "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR:~0,-1%" -cp "%WRAPPER_JAR%" org.apache.maven.wrapper.MavenWrapperMain %*
