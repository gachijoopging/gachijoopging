// 생성물이다. 고치지 말고 `npm run gen:mocks` 를 돌린다. 원본은 docs/openapi.yaml 의 example.
export const MOCKS = {
  "GET /activities/{id}": {
    "data": {
      "id": "a100",
      "user": {
        "id": "8a2d…",
        "nickname": "상혁",
        "photoUrl": null,
        "withdrawn": false
      },
      "status": "ENDED",
      "startedAt": "2026-09-05T09:02:00Z",
      "endedAt": "2026-09-05T09:48:00Z",
      "durationSec": 2520,
      "pausedSec": 240,
      "paused": false,
      "pausedAt": null,
      "distanceM": 3120,
      "steps": 4100,
      "locationShared": true,
      "itemCount": 27,
      "byCategory": {
        "CIGARETTE": 14,
        "PLASTIC": 6,
        "CAN": 3,
        "PAPER": 2,
        "VINYL": 2
      },
      "route": [
        [
          126.93,
          37.52
        ],
        [
          126.931,
          37.521
        ]
      ],
      "photos": [
        {
          "id": "p1",
          "url": "https://cdn…/a100/p1.jpg",
          "thumbUrl": "https://cdn…/a100/p1_t.jpg",
          "takenAt": "2026-09-05T09:10:00Z"
        }
      ],
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000001",
          "photoId": "p1",
          "category": "PLASTIC",
          "quantity": 2,
          "source": "AI",
          "aiConfidence": 0.91,
          "unclassified": false,
          "bbox": {
            "x": 0.2,
            "y": 0.3,
            "w": 0.2,
            "h": 0.25
          }
        },
        {
          "id": "00000000-0000-4000-8000-000000000002",
          "photoId": null,
          "category": "CIGARETTE",
          "quantity": 5,
          "source": "MANUAL",
          "aiConfidence": null,
          "unclassified": false,
          "bbox": null
        }
      ]
    }
  },
  "GET /crew": {
    "data": {
      "id": "c001",
      "name": "한강줍깅크루",
      "intro": "매주 토요일 아침 여의도",
      "photoUrl": null,
      "leader": {
        "id": "6f1c…",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      },
      "memberCount": 18,
      "goalCount": 300,
      "inviteCode": "HG-7K2P",
      "pendingJoinRequests": 2,
      "pinnedNotice": {
        "id": "n01",
        "title": "9월 정기 활동 안내",
        "createdAt": "2026-09-01T09:00:00Z"
      },
      "unreadChat": 5,
      "isLeader": true
    }
  },
  "GET /crew/home": {
    "data": {
      "crew": {
        "id": "c001",
        "name": "한강줍깅크루"
      },
      "last7d": {
        "crewItems": 168,
        "myItems": 23,
        "myByCategory": {
          "CIGARETTE": 14,
          "PLASTIC": 6,
          "CAN": 3
        },
        "daily": [
          12,
          30,
          0,
          41,
          25,
          38,
          22
        ]
      },
      "character": {
        "windowDays": 14,
        "items": 312,
        "goalCount": 300,
        "stage": 5
      },
      "live": {
        "count": 2,
        "users": [
          {
            "id": "8a2d…",
            "nickname": "상혁",
            "photoUrl": null,
            "withdrawn": false
          },
          {
            "id": "9b3e…",
            "nickname": "지수",
            "photoUrl": null,
            "withdrawn": false
          }
        ]
      },
      "unreadNotifications": 3
    }
  },
  "GET /crew/live": {
    "data": [
      {
        "user": {
          "id": "8a2d…",
          "nickname": "상혁",
          "photoUrl": null,
          "withdrawn": false
        },
        "activityId": "a101",
        "startedAt": "2026-09-07T08:30:00Z",
        "elapsedSec": 900,
        "distanceM": 1200,
        "itemCount": 9,
        "paused": false,
        "locationShared": true,
        "location": {
          "lng": 126.93,
          "lat": 37.52
        }
      },
      {
        "user": {
          "id": "9b3e…",
          "nickname": "지수",
          "photoUrl": null,
          "withdrawn": false
        },
        "activityId": "a102",
        "startedAt": "2026-09-07T08:40:00Z",
        "elapsedSec": 300,
        "distanceM": 400,
        "itemCount": 2,
        "paused": true,
        "locationShared": false,
        "location": null
      }
    ]
  },
  "GET /crew/members": {
    "data": [
      {
        "id": "6f1c…",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false,
        "isLeader": true,
        "totalItems": 412,
        "joinedAt": "2026-09-01T00:00:00Z",
        "following": false
      },
      {
        "id": "8a2d…",
        "nickname": "상혁",
        "photoUrl": null,
        "withdrawn": false,
        "isLeader": false,
        "totalItems": 380,
        "joinedAt": "2026-09-02T00:00:00Z",
        "following": true
      }
    ]
  },
  "GET /crew/members/{userId}/posts": {
    "data": {
      "items": [
        {
          "id": "po77",
          "author": {
            "id": "8a2d…",
            "nickname": "상혁",
            "photoUrl": null,
            "withdrawn": false
          },
          "text": "오늘 여의도 3km. 꽁초가 유난히 많았다",
          "visibility": "CREW",
          "media": [
            {
              "url": "https://cdn…/po77/1.jpg",
              "thumbUrl": "https://cdn…/po77/1_t.jpg"
            }
          ],
          "likeCount": 6,
          "liked": true,
          "commentCount": 2,
          "createdAt": "2026-09-06T11:00:00Z"
        }
      ],
      "nextCursor": "eyJ…"
    }
  },
  "GET /crew/notices": {
    "data": {
      "items": [
        {
          "id": "n01",
          "title": "9월 정기 활동 안내",
          "preview": "9월 첫째 주 토요일, 여의도에서 모여요.",
          "pinned": true,
          "commentCount": 2,
          "createdAt": "2026-09-01T09:00:00Z"
        },
        {
          "id": "n00",
          "title": "새 크루원 환영합니다",
          "preview": "소개를 확인해 주세요.",
          "pinned": false,
          "commentCount": 0,
          "createdAt": "2026-08-28T09:00:00Z"
        }
      ],
      "nextCursor": null
    }
  },
  "GET /crew/posts": {
    "data": {
      "items": [
        {
          "id": "po77",
          "author": {
            "id": "8a2d…",
            "nickname": "상혁",
            "photoUrl": null,
            "withdrawn": false
          },
          "text": "오늘 여의도 3km. 꽁초가 유난히 많았다",
          "visibility": "CREW",
          "media": [
            {
              "url": "https://cdn…/po77/1.jpg",
              "thumbUrl": "https://cdn…/po77/1_t.jpg"
            }
          ],
          "likeCount": 6,
          "liked": true,
          "commentCount": 2,
          "createdAt": "2026-09-06T11:00:00Z"
        }
      ],
      "nextCursor": "eyJ…"
    }
  },
  "GET /crew/stats": {
    "data": {
      "range": "MONTH",
      "totals": {
        "items": 1430,
        "distanceM": 128000,
        "durationSec": 96000,
        "activities": 62
      },
      "byCategory": {
        "CIGARETTE": 620,
        "PLASTIC": 310,
        "CAN": 190,
        "PAPER": 120,
        "VINYL": 110,
        "GLASS": 40,
        "GENERAL": 40
      },
      "series": [
        {
          "date": "2026-09-01",
          "items": 40
        },
        {
          "date": "2026-09-02",
          "items": 0
        },
        {
          "date": "2026-09-03",
          "items": 77
        }
      ],
      "ranking": [
        {
          "rank": 1,
          "user": {
            "id": "6f1c…",
            "nickname": "관열",
            "photoUrl": null,
            "withdrawn": false
          },
          "items": 412,
          "distanceM": 30100
        },
        {
          "rank": 2,
          "user": {
            "id": "8a2d…",
            "nickname": "상혁",
            "photoUrl": null,
            "withdrawn": false
          },
          "items": 380,
          "distanceM": 28800
        }
      ]
    }
  },
  "GET /crews/join-requests/mine": {
    "data": {
      "id": "jr001",
      "crew": {
        "id": "c001",
        "name": "한강줍깅크루"
      },
      "user": {
        "id": "u001",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      },
      "status": "PENDING",
      "createdAt": "2026-09-15T10:00:00Z"
    }
  },
  "GET /crews/preview": {
    "data": {
      "id": "c001",
      "name": "한강줍깅크루",
      "memberCount": 18,
      "photoUrl": null,
      "intro": "매주 토요일 아침 여의도",
      "leader": {
        "id": "u001",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      }
    }
  },
  "GET /notices/{noticeId}": {
    "data": {
      "id": "n01",
      "title": "9월 정기 활동 안내",
      "preview": "9월 첫째 주 토요일, 여의도에서 모여요.",
      "pinned": true,
      "commentCount": 2,
      "createdAt": "2026-09-01T09:00:00Z",
      "body": "9월 첫째 주 토요일, 여의도에서 모여요.\n오전 8시 여의나루역 2번 출구 앞입니다. 집게와 봉투는 크루에서 준비해요.",
      "comments": [
        {
          "id": "nc1",
          "author": {
            "id": "8a2d…",
            "nickname": "상혁",
            "photoUrl": null,
            "withdrawn": false
          },
          "text": "확인했습니다!",
          "createdAt": "2026-09-01T10:00:00Z"
        },
        {
          "id": "nc2",
          "author": {
            "id": "6f1c…",
            "nickname": "관열",
            "photoUrl": null,
            "withdrawn": false
          },
          "text": "비 오면 일요일로 미뤄요.",
          "createdAt": "2026-09-01T11:00:00Z"
        }
      ]
    }
  },
  "GET /notifications": {
    "data": {
      "pending": {
        "joinRequests": 2,
        "reports": 1
      },
      "items": [
        {
          "id": 501,
          "type": "ACTIVITY_STARTED",
          "title": "상혁 님이 줍깅을 시작했어요",
          "detail": "여의도 근처",
          "unread": true,
          "target": {
            "type": "LIVE",
            "id": "a101"
          },
          "createdAt": "2026-09-07T08:30:05Z"
        },
        {
          "id": 500,
          "type": "COMMENT",
          "title": "지수 님이 댓글을 남겼어요",
          "detail": "오늘 많이 주우셨네요!",
          "unread": false,
          "target": {
            "type": "POST",
            "id": "po77"
          },
          "createdAt": "2026-09-06T21:10:00Z"
        }
      ],
      "nextCursor": null
    }
  },
  "GET /notifications/unread-count": {
    "data": {
      "count": 1
    }
  },
  "GET /users/me": {
    "data": {
      "id": "6f1c…",
      "nickname": "관열",
      "intro": "한강 서쪽 담당",
      "photoUrl": "https://cdn…/p/6f1c.jpg",
      "email": "kwan@example.com",
      "profileComplete": true,
      "hasPassword": true,
      "linked": {
        "kakao": true,
        "google": false
      },
      "settings": {
        "shareLocationDefault": true,
        "notifyActivityStart": true
      },
      "membership": {
        "status": "MEMBER",
        "crew": {
          "id": "c001",
          "name": "한강줍깅크루",
          "isLeader": true
        }
      }
    }
  },
  "PATCH /users/me": {
    "data": {
      "id": "9c2f…",
      "nickname": "새싹줍깅러",
      "intro": "",
      "photoUrl": null,
      "email": null,
      "profileComplete": true,
      "hasPassword": false,
      "linked": {
        "kakao": true,
        "google": false
      },
      "settings": {
        "shareLocationDefault": true,
        "notifyActivityStart": true
      },
      "membership": {
        "status": "NONE",
        "crew": null
      }
    }
  },
  "POST /auth/google": {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9.mock…",
      "refreshToken": "8f2a9c1e-mock-refresh…",
      "isNew": false
    }
  },
  "POST /auth/kakao": {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9.mock…",
      "refreshToken": "8f2a9c1e-mock-refresh…",
      "isNew": false
    }
  },
  "POST /auth/login": {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9.mock…",
      "refreshToken": "8f2a9c1e-mock-refresh…",
      "isNew": false
    }
  },
  "POST /auth/refresh": {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9.mock…",
      "refreshToken": "8f2a9c1e-mock-refresh…",
      "isNew": false
    }
  },
  "POST /auth/signup": {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiJ9.mock…",
      "refreshToken": "8f2a9c1e-mock-refresh…",
      "isNew": false
    }
  },
  "POST /crew/invite-code": {
    "data": {
      "inviteCode": "HG-9QX4"
    }
  },
  "POST /crews": {
    "data": {
      "id": "c001",
      "name": "한강줍깅크루",
      "intro": "",
      "photoUrl": null,
      "leader": {
        "id": "u001",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      },
      "memberCount": 1,
      "goalCount": 300,
      "inviteCode": "HG-7K2P",
      "pendingJoinRequests": 0,
      "pinnedNotice": null,
      "unreadChat": 0,
      "isLeader": true
    }
  },
  "POST /crews/join-requests": {
    "data": {
      "id": "jr001",
      "crew": {
        "id": "c001",
        "name": "한강줍깅크루"
      },
      "user": {
        "id": "u001",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      },
      "status": "PENDING",
      "createdAt": "2026-09-15T10:00:00Z"
    }
  },
  "POST /media": {
    "data": {
      "mediaId": "m001",
      "photoId": "p1",
      "url": "https://cdn…/a100/p1.jpg",
      "thumbUrl": "https://cdn…/a100/p1_t.jpg",
      "inference": {
        "status": "OK",
        "modelVersion": "yolo26s-1024-v1",
        "inferenceMs": 180,
        "items": [
          {
            "category": "PLASTIC",
            "aiConfidence": 0.91,
            "bbox": {
              "x": 0.2,
              "y": 0.3,
              "w": 0.2,
              "h": 0.25
            }
          },
          {
            "category": "PLASTIC",
            "aiConfidence": 0.62,
            "bbox": {
              "x": 0.6,
              "y": 0.4,
              "w": 0.15,
              "h": 0.2
            }
          },
          {
            "category": "CAN",
            "aiConfidence": 0.88,
            "bbox": {
              "x": 0.1,
              "y": 0.7,
              "w": 0.1,
              "h": 0.15
            }
          }
        ]
      }
    }
  },
  "POST /notices/{noticeId}/comments": {
    "data": {
      "id": "00000000-0000-4000-8000-0000000000c3",
      "author": {
        "id": "6f1c…",
        "nickname": "관열",
        "photoUrl": null,
        "withdrawn": false
      },
      "text": "저도 참여할게요.",
      "createdAt": "2026-09-01T12:00:00Z"
    }
  },
} as const;

export type MockKey = keyof typeof MOCKS;
