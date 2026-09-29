/**
 * CSRF HTTP Interceptor - Automatically adds CSRF token to state-changing requests
 * Implements Double Submit Cookie pattern by adding X-CSRF-Token header
 */
(function () {
    'use strict';

    angular
        .module('webApp')
        .factory('csrfInterceptor', csrfInterceptor);

    csrfInterceptor.$inject = ['$q', '$injector'];

    function csrfInterceptor($q, $injector) {
        var interceptor = {
            request: request,
            responseError: responseError
        };

        return interceptor;

        /**
         * Request interceptor - Adds CSRF token header to state-changing requests.
         * Si el token aún no está disponible (race condition al arranque), espera la
         * promise de initializeToken() antes de dejar salir el request.
         */
        function request(config) {
            var statefulMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
            var method = config.method ? config.method.toUpperCase() : '';

            config.headers = config.headers || {};

            if (statefulMethods.indexOf(method) !== -1) {
                var csrfService = $injector.get('csrfService');
                var token = csrfService.getToken();

                if (token) {
                    // Token en memoria o cookie: agregar header y seguir
                    config.headers['X-CSRF-Token'] = token;
                    return config;
                }

                // Token no disponible aún — esperar el GET /api/csrf/token en vuelo
                return csrfService.initializeToken()
                    .then(function (newToken) {
                        config.headers['X-CSRF-Token'] = newToken;
                        return config;
                    })
                    .catch(function () {
                        // Si el fetch del token falla, dejar pasar — el servidor devolverá 403
                        // y responseError lo reintentará
                        return config;
                    });
            }

            return config;
        }

        /**
         * Response error interceptor - en 403 por CSRF, refresca el token y reintenta una vez.
         */
        function responseError(rejection) {
            if (rejection.status === 403) {
                console.error('CSRF validation failed (403 Forbidden):', rejection.config.url);

                // Reintentar UNA vez con token fresco (evitar loop con _csrfRetry)
                if (!rejection.config._csrfRetry) {
                    rejection.config._csrfRetry = true;
                    var csrfService = $injector.get('csrfService');
                    return csrfService.refreshToken()
                        .then(function (newToken) {
                            rejection.config.headers['X-CSRF-Token'] = newToken;
                            return $injector.get('$http')(rejection.config);
                        })
                        .catch(function () {
                            return $q.reject(rejection);
                        });
                }

                // Segundo fallo consecutivo — broadcast para que la UI informe al usuario
                var errorMessage = rejection.data && rejection.data.Message
                    ? rejection.data.Message
                    : 'CSRF token validation failed. Please refresh the page and try again.';

                console.error(errorMessage);

                var $rootScope = $injector.get('$rootScope');
                $rootScope.$broadcast('csrf.validationFailed', {
                    url: rejection.config.url,
                    message: errorMessage
                });
            }

            return $q.reject(rejection);
        }
    }
})();
