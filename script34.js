(function (angular) {
    //Default environment variables
    var __env = {};
    if (window) {	//Importa las variables si existen
        angular.merge(__env, window.__env);
    }

    angular
        .module('webApp', ['ngRoute', 'angular-storage', 'ngResource', 'ngSanitize', 'ngBusy', 'ngAnimate', 'ui.bootstrap', 'ui.select', 'ui.toggle', 'app.auth', 'app.validation',
            'app.services', 'datatables', 'datatables.bootstrap', 'dateTimePicker', 'smartmenus', 'cuitValidator',
            'formulario01DServices', 'afipServices', 'siteServices', 'tipoTramiteServices',
            'prcrgServices', 'precargaServices', 'vendedorServices', 'compradorServices', 'homeServices', 'provinciaServices', 'localidadServices', 'vehiculoServices',
            'registroServices', 'turnoServices', 'recuperarServices', 'formulario08DServices', 'consultaEstadoServices', 'encuestaServices', 'inputMask',
            'tramiteOnlineServices', 'estimadorServices', 'tramitesDigitalesServices', 'escribanosServices']);

    angular
        .module('webApp')
        .constant('appConfig', __env);

    angular
        .module('webApp')
        .controller('appController', ['$rootScope', '$scope', '$route', '$location', '$uibModal', 'authentication', 'appConfig', 'QueryStringService', appController]);

    angular
        .module('webApp')
        .factory('session', [function () {
            var session = [];

            var add = function (obj) {
                session.push(obj);
            }

            var get = function (index) {
                return session[index];
            }

            var remove = function (index) {
                session.splice(index, 1);
            }

            var set = function (index, value) {
                session[index] = value;
            }

            var len = function () {
                return session.length;
            }

            var clear = function (obj) {
                session = [];
            }

            return {
                add: add,
                get: get,
                set: set,
                len: len,
                clear: clear,
                remove: remove
            };
        }]);


    angular
        .module('webApp')
        .factory('errorHandler', ['$q', '$rootScope', function ($q, $rootScope) {
            var interceptor = {
                responseError: function (response) {
                    if (response.status === 500) {
                        $rootScope.$broadcast('serverError.500', response);
                    }
                    return $q.reject(response);
                }
            }
            return interceptor;
        }]);

    angular
        .module('webApp')
        .directive('capitalize', function () {
            return {
                require: 'ngModel',
                link: function (scope, element, attrs, modelCtrl) {
                    var capitalize = function (inputValue) {
                        if (inputValue == undefined) inputValue = '';
                        var capitalized = inputValue.toUpperCase();
                        if (capitalized !== inputValue) {
                            modelCtrl.$setViewValue(capitalized);
                            modelCtrl.$render();
                        }
                        return capitalized;
                    }
                    modelCtrl.$parsers.push(capitalize);
                    capitalize(scope[attrs.ngModel]); // capitalize initial value
                }
            };
        })
        .config(['$httpProvider', '$compileProvider', 'appConfig', function ($httpProvider, $compileProvider, appConfig) {
            $compileProvider.debugInfoEnabled(appConfig.debugMode);
            $compileProvider.commentDirectivesEnabled(appConfig.debugMode);
            $compileProvider.cssClassDirectivesEnabled(appConfig.debugMode);

            //initialize get if not there
            if (!$httpProvider.defaults.headers.get) {
                $httpProvider.defaults.headers.get = {};
            }
            $httpProvider.defaults.headers.get['Cache-Control'] = 'no-cache';
            $httpProvider.defaults.headers.get['Pragma'] = 'no-cache';

            //$httpProvider.defaults.headers.get['Access-Control-Allow-Origin'] = '*';

            $httpProvider.interceptors.push('errorHandler');
            $httpProvider.interceptors.push('csrfInterceptor');
        }
        ]);


    function appController($rootScope, $scope, $route, $location, $uibModal, authentication, appConfig, QueryStringService) {
        var vm = this;

        var token = QueryStringService.getFilters();
        $rootScope.claims = token;

        vm.titulo = 'Sistema Integral de Trámites Electrónicos';

        //FIX MENU EN SPA
        $('.navbar a.navbar-link').click(function () {
            var navbar_toggle = $('.navbar-toggle');
            if (navbar_toggle.is(':visible')) {
                navbar_toggle.trigger('click');
            }
        });

        vm.isAuthenticated = authentication.isAuthenticated();
        vm.currentUser = authentication.getCurrentLoginUser();

        vm.logout = function () {
            authentication.logout();
        };

        $rootScope.$on('$routeChangeStart', function (event, next) {
            //Para poder setear el titulo manualmente a traves de 
            //setTitulo($scope, titulo)
            //en route tenemos que poner
            //titulo: null
            if (next.titulo) {
                vm.titulo = next.titulo;
            }
            if (next.subtitulo) {
                vm.subtitulo = next.subtitulo;
            }
            $rootScope.subtitulo1 = next.subtitulo1;
            $rootScope.mostrar = next.mostrar;
        });

        $scope.$on('loginStatusChanged', function (event, isAuthenticated, userData) {
            /*vm.isAuthenticated = isAuthenticated;
            vm.currentUser = userData;
            if (isAuthenticated) {
                $location.path('/');
            } else {
                $location.path('/login');
            }*/
        });

        var busyModal;
        var exceptionList = [];
        $scope.$on('busy.begin', function (event, config) {
            if (!busyModal && contains(config.url.toLowerCase(), ['api/']) && !contains(config.url.toLowerCase(), exceptionList)) {
                busyModal = $uibModal.open({
                    animation: false,
                    templateUrl: 'busyModal.html',
                    controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                        $scope.$on('busy.end', function (evnt, cfg) {
                            if (cfg.remaining === 0) {
                                $uibModalInstance.dismiss('cancel');
                                busyModal = null;
                            }
                        });
                    }],
                    size: 'sm',
                    backdrop: 'static'
                });
            }
        });

        var errorModal;
        var showError = appConfig.showErrorDetail;
        $rootScope.$on('serverError.500', function (event, errorResponse) {
            if (!errorModal) {
                errorModal = $uibModal.open({
                    animation: true,
                    templateUrl: 'errorModal.html',
                    controller: ['$scope', '$uibModalInstance', 'errorResponse', function ($scope, $uibModalInstance, errorResponse) {
                        var errorVm = this;
                        errorVm.showError = showError;
                        errorVm.error = showError ? errorResponse : null;
                        errorVm.close = function () {
                            $uibModalInstance.dismiss('cancel');
                            errorModal = null;
                        }
                    }],
                    controllerAs: 'errorMD',
                    size: showError ? 'lg' : '',
                    backdrop: 'static',
                    resolve: {
                        errorResponse: function () {
                            return errorResponse;
                        }
                    }
                });
            }
        });
    }

    angular.module('webApp').config(['$qProvider', function ($qProvider) {
        $qProvider.errorOnUnhandledRejections(false);
    }]);

    // Initialize CSRF token on application startup
    angular.module('webApp').run(['csrfService', function (csrfService) {
        csrfService.initializeToken()
            .catch(function (error) {
                console.error('Failed to initialize CSRF token:', error);
            });
    }]);
})(angular)