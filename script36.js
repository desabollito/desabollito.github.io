var enums = {
    authorised: {
        authorised: 0,
        loginRequired: 1,
        notAuthorised: 2
    },
    permissionCheckType: {
        atLeastOne: 0,
        combinationRequired: 1
    }
};

var events = {
    userLoggedIn: 'auth:user:loggedIn',
    userLoggedOut: 'auth:user:loggedOut'
};

var clientId = 'angularWebApp';

angular
    .module('app.auth', [])
    .factory('authentication', ['$rootScope', '$http', '$q', 'store',
        function ($rootScope, $http, $q, store) {
            var saveUserData = function (data) {
                var userData = {
                    userName: data.userName,
                    givenName: data.givenName,
                    surname: data.surname,
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    aliases: data.aliases.split(',')
                }
                store.set("userData", userData);
                return userData;
            }

            var getCurrentLoginUser = function () {
                return store.get('userData');
            },

                isAuthenticated = function () {
                    if (getCurrentLoginUser())
                        return true;
                    else
                        return false;
                },

                logout = function () {
                    store.remove('userData');
                    $rootScope.$broadcast('loginStatusChanged', false, null);
                },

                login = function (username, password) {
                    return $http
                        .post('token', "grant_type=password&username=" + username + "&password=" + password + "&client_id=" + clientId)
                        .then(function (response) {
                            var userData = saveUserData(response.data);
                            $rootScope.$broadcast('loginStatusChanged', true, userData);
                        }, function (response) {
                            if (response.status === 400 && response.data.error) {
                                throw response.data.error_description;
                            }
                        });
                },

                refreshToken = function () {
                    var deferred = $q.defer();
                    var userData = getCurrentLoginUser();
                    if (userData) {
                        $http.post('token', "grant_type=refresh_token&refresh_token=" + userData.refresh_token + "&client_id=" + clientId)
                            .then(function (response) {
                                saveUserData(response.data);
                                deferred.resolve(response);
                            },
                            function (response) {
                                logout();
                                deferred.reject(response);
                            });
                    } else {
                        deferred.reject();
                    }
                    return deferred.promise;
                },

                getAuthenticationToken = function () {
                    var userData = store.get('userData');
                    if (userData)
                        return userData.access_token;
                    else
                        return null;
                };

            return {
                getCurrentLoginUser: getCurrentLoginUser,
                isAuthenticated: isAuthenticated,
                login: login,
                logout: logout,
                refreshToken: refreshToken,
                getAuthenticationToken: getAuthenticationToken
            };
        }
    ])
    .factory('authorization', ['authentication',
        function (authentication) {
            var authorize = function (allowAnonymous, requiredPermissions, permissionCheckType) {
                var result = enums.authorised.authorised,
                    user = authentication.getCurrentLoginUser(),
                    loweredPermissions = [],
                    hasPermission = true,
                    permission,
                    i;

                permissionCheckType = permissionCheckType || enums.permissionCheckType.atLeastOne;
                if (allowAnonymous !== true && (user === undefined || user === null)) {
                    result = enums.authorised.loginRequired;
                } else if ((allowAnonymous !== true && user !== undefined && user !== null) &&
                    (requiredPermissions === undefined || requiredPermissions.length === 0)) {
                    // Login is required but no specific permissions are specified.
                    result = enums.authorised.authorised;
                } else if (requiredPermissions) {
                    loweredPermissions = [];
                    angular.forEach(user.aliases, function (alias) {
                        loweredPermissions.push(alias.toLowerCase());
                    });

                    for (i = 0; i < requiredPermissions.length; i += 1) {
                        permission = requiredPermissions[i].toLowerCase();
                        if (permissionCheckType === enums.permissionCheckType.combinationRequired) {
                            hasPermission = hasPermission && loweredPermissions.indexOf(permission) > -1;
                            // if all the permissions are required and hasPermission is false there is no point carrying on
                            if (hasPermission === false) {
                                break;
                            }
                        } else if (permissionCheckType === enums.permissionCheckType.atLeastOne) {
                            hasPermission = loweredPermissions.indexOf(permission) > -1;
                            // if we only need one of the permissions and we have it there is no point carrying on
                            if (hasPermission) {
                                break;
                            }
                        }
                    }
                    result = hasPermission ? enums.authorised.authorised : enums.authorised.notAuthorised;
                }
                return result;
            };

            return {
                authorize: authorize
            };
        }
    ])
    .directive('access', ['authorization',
        function (authorization) {
            return {
                restrict: 'A',
                link: function (scope, element, attrs) {
                    var makeVisible = function () {
                        element.removeClass('hidden');
                    },
                        makeHidden = function () {
                            element.addClass('hidden');
                        },
                        alias = attrs.access.split(','),
                        determineVisibility = function (resetFirst) {
                            if (resetFirst) {
                                makeVisible();
                            }

                            var result = authorization.authorize(false, alias, attrs.accessPermissionType);
                            if (result === enums.authorised.authorised) {
                                makeVisible();
                            } else {
                                makeHidden();
                            }
                        };

                    if (alias.length > 0) {
                        determineVisibility(true);
                    }
                }
            };
        }
    ])
    .factory('authInterceptor', ['store', '$location', '$q', '$rootScope', '$injector', function (store, $location, $q, $rootScope, $injector) {
        var inFlightAuthRequest = null;

        var retryHttpRequest = function (config, deferred) {
            var $http = $injector.get('$http');
            $http(config, deferred)
                .then(function (response) {
                    deferred.resolve(response);
                }, function (response) {
                    deferred.reject(response);
                });
        }

        var interceptor = {
            request: function (config) {
                var userData = store.get("userData");
                if (userData) {
                    config.headers['Authorization'] = "Bearer " + userData.access_token;
                }
                return config;
            },
            response: function (response) {
                return response || $q.when(response);
            },
            responseError: function (response) {
                var deferred = $q.defer();
                if (response.status === 401) {
                    var authentication = $injector.get('authentication');
                    //inFlightAuthRequest => mecanismo para encolar multiples requests en un solo llamado de refresh-token y evitar problemas de concurrencia
                    if (!inFlightAuthRequest) {
                        inFlightAuthRequest = authentication.refreshToken();
                    }
                    inFlightAuthRequest
                        .then(function () {
                            inFlightAuthRequest = null;
                            retryHttpRequest(response.config, deferred);
                        }, function () {
                            inFlightAuthRequest = null;
                            authentication.logout();
                            deferred.reject(response);
                        });
                } else {
                    deferred.reject(response);
                }
                return deferred.promise;
            }
        }

        return interceptor;
    }])
    .service('QueryStringService', function ($location, $http) {
        this.getFilters = function (filterObj) {
            var qs = $location.search();

            if (typeof(qs) !== 'undefined') {
                try {
                    return qs.t;
                }
                catch (e) {
                    return '';
                }
            }
        };

        function urlBase64Decode(str) {
            var output = str.replace('-', '+').replace('_', '/');
            switch (output.length % 4) {
                case 0:
                    break;
                case 2:
                    output += '==';
                    break;
                case 3:
                    output += '=';
                    break;
                default:
                    throw 'Illegal base64url string!';
            }
            return window.atob(output);
        }

        function getClaimsFromToken(tokenParam) {
            var token = tokenParam.toString();
            var user = {};
            if (typeof token !== 'undefined') {
                var encoded = token.split('.')[1];
                user = JSON.parse(urlBase64Decode(encoded));
            }
            return user;
        }
    })
    .config(['$httpProvider', function ($httpProvider) {
        //$httpProvider.interceptors.push('authInterceptor');
    }])
    .run(['$rootScope', '$location', 'authorization', function ($rootScope, $location, authorization) {
        $rootScope.$on('$routeChangeStart', function (event, next, current) {
            //var authorised;
            //if (next.access !== undefined) {
            //	authorised = authorization.authorize(next.access.allowAnonymous, next.access.permissions, next.access.permissionCheckType);
            //	if (authorised === enums.authorised.notAuthorised) {
            //		next.$$route.templateUrl = "notauthorized.html";
            //		next.$$route.controller = null;
            //	} else if (authorised === enums.authorised.loginRequired) {
            //		$location.path('/login').replace();
            //	}
            //}
        });
    }]);