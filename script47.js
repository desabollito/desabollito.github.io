/**
 * CSRF Service - Manages CSRF token lifecycle
 * Responsible for fetching and refreshing CSRF tokens from the server
 */
(function () {
    'use strict';

    angular
        .module('webApp')
        .factory('csrfService', csrfService);

    csrfService.$inject = ['$http', '$q', 'appConfig'];

    function csrfService($http, $q, appConfig) {
        var service = {
            initializeToken: initializeToken,
            refreshToken: refreshToken,
            getToken: getToken
        };

        var currentToken = null;
        var _pendingInit = null; // promise en vuelo — evita doble GET si se llama varias veces

        return service;

        /**
         * Initialize CSRF token on application startup.
         * If a fetch is already in progress, devuelve la misma promise (no hace un segundo GET).
         */
        function initializeToken() {
            if (_pendingInit) return _pendingInit;
            var apiBase = appConfig.apiBaseUrl || '';
            _pendingInit = $http.get(apiBase + 'api/csrf/token')
                .then(function (response) {
                    _pendingInit = null;
                    if (response.data && response.data.token) {
                        currentToken = response.data.token;
                        console.log('CSRF token refreshed successfully');
                        return currentToken;
                    } else {
                        console.error('CSRF token response invalid:', response.data);
                        return $q.reject('Invalid CSRF token response');
                    }
                })
                .catch(function (error) {
                    _pendingInit = null;
                    console.error('Failed to fetch CSRF token:', error);
                    return $q.reject(error);
                });
            return _pendingInit;
        }

        /**
         * Fuerza un nuevo fetch descartando el token actual.
         * Usar solo en retry tras 403.
         */
        function refreshToken() {
            _pendingInit = null;
            currentToken = null;
            return initializeToken();
        }

        /**
         * Get the current CSRF token from memory or cookie
         * @returns {string} The current CSRF token
         */
        function getToken() {
            // Try memory first
            if (currentToken) {
                return currentToken;
            }

            // Fallback to reading from cookie
            var cookieToken = getCookie('XSRF-TOKEN');
            if (cookieToken) {
                currentToken = cookieToken;
                return currentToken;
            }

            console.warn('CSRF token not found. Call initializeToken() first.');
            return null;
        }

        /**
         * Helper function to read a cookie by name
         * @param {string} name - Cookie name
         * @returns {string|null} Cookie value or null
         */
        function getCookie(name) {
            var nameEQ = name + "=";
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i];
                while (cookie.charAt(0) === ' ') {
                    cookie = cookie.substring(1, cookie.length);
                }
                if (cookie.indexOf(nameEQ) === 0) {
                    return cookie.substring(nameEQ.length, cookie.length);
                }
            }
            return null;
        }
    }
})();
