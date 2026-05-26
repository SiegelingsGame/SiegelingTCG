package com.sieglings.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SocialThreadUtilTest {

    @Test
    void threadIdIsStableRegardlessOfArgumentOrder() {
        String first = SocialThreadUtil.threadId("alpha@test.com", "beta@test.com");
        String second = SocialThreadUtil.threadId("beta@test.com", "alpha@test.com");
        assertEquals(first, second);
        assertEquals("alpha@test.com__beta@test.com", first);
    }
}
