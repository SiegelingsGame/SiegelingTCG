#!/bin/sh
# Maven Wrapper script - downloads Maven if not present
# Based on Apache Maven Wrapper 3.2.0

set -e

if [ -z "$JAVA_HOME" ] ; then
  JAVACMD="java"
else
  JAVACMD="$JAVA_HOME/bin/java"
fi

MAVEN_PROJECTBASEDIR="${MAVEN_BASEDIR:-$(cd "$(dirname "$0")" && pwd)}"
WRAPPER_JAR="$MAVEN_PROJECTBASEDIR/.mvn/wrapper/maven-wrapper.jar"
WRAPPER_PROPERTIES="$MAVEN_PROJECTBASEDIR/.mvn/wrapper/maven-wrapper.properties"

if [ ! -f "$WRAPPER_JAR" ]; then
  echo "Downloading Maven Wrapper..."
  if [ -f "$WRAPPER_PROPERTIES" ]; then
    WRAPPER_URL=$(grep 'wrapperUrl' "$WRAPPER_PROPERTIES" | cut -d'=' -f2-)
  fi
  if [ -z "$WRAPPER_URL" ]; then
    WRAPPER_URL="https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar"
  fi
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL -o "$WRAPPER_JAR" "$WRAPPER_URL"
  elif command -v wget > /dev/null 2>&1; then
    wget -q -O "$WRAPPER_JAR" "$WRAPPER_URL"
  else
    echo "Error: curl or wget required to download Maven Wrapper"
    exit 1
  fi
fi

exec "$JAVACMD" \
  -jar "$WRAPPER_JAR" \
  "$@"
