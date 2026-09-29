angular
    .module('webApp')
    .controller('vendedoresController', ['$scope', '$compile', '$location', '$uibModal', '$http', '$window', 'session', 'home', 'Vendedor', 'appConfig', 'popupService',
        vendedoresController]);

function vendedoresController($scope, $compile, $location, $uibModal, $http, $window, session, home, Vendedor, appConfig, popupService) {
    var vm = this;

   
    vm.cancelar = function () {
        $location.path('/');
    }

    vm.siguiente = function () {

        if (session.len() <= 0)
            session.add(vm.Tramite);
        else
            session.set(0, vm.Tramite);

        //$location.path('/seleccionarRegistro08');
        //return;

        popupService.showMessage('C​uando el <b>vendedor</b> y el <b>comprador</b> viven en el mismo <b>partido/departamento</b>, el trámite debe presentarse en el <b>registro</b> de <b>actual</b> radicación.<br/><br/>El legajo no cambia de registro​​.', 'Registro').then(function () {
            modalInstance = $uibModal.open({
                animation: true,
                templateUrl: 'app/modules/vendedores/preguntaRadicacion.html',
                controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {

                    $scope.Titulo = "Radicación del trámite";
                    $scope.Pregunta = "¿En qué registro querés realizar el trámite de transferencia?";

                    $scope.vendedor = function () {
                        $uibModalInstance.close(true);
                    }

                    $scope.comprador = function () {
                        $uibModalInstance.close(false);
                    }
                }],
                controllerAs: 'legalCtrl',
                backdrop: 'static',
                resolve: {
                }
            });

            modalInstance.result.then(function (rta) {
                if (!rta)
                    $location.path('/seleccionarRegistro08');
                else {
                    modalInstance = $uibModal.open({
                        animation: true,
                        templateUrl: 'app/modules/vendedores/pregunta.html',
                        controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {

                            $scope.Titulo = "Formulario 08";
                            $scope.Pregunta = "¿Ud posee un Formulario 08 con firma certificada?";

                            $scope.aceptar = function () {
                                $uibModalInstance.close(true);
                            }

                            $scope.close = function () {
                                $uibModalInstance.close(false);
                            }
                        }],
                        controllerAs: 'legalCtrl',
                        backdrop: 'static',
                        resolve: {
                        }
                    });

                    modalInstance.result.then(function (rta) {
                        if (rta)
                            $location.path('/certificado');
                        else
                            $location.path("/titulares");
                    }, function () {
                    });
                }
            }, function () {
            });
        });
    }

    if (session.len() <= 0) {
        vm.Tramite = new Tramite08();
        vm.Tramite.Dominio = '';
        vm.Tramite.Chasis = '';
        vm.Tramite.origenSite = appConfig.origenSite;
    }

    var tramite = session.get(0);
    if (typeof (tramite) !== "undefined") {
        vm.Tramite = tramite;
        if (!tramite.AmbasPartes) {
            vm.MostrarResultado = true;
            return;
        }
    }

    //TEST
    //vm.Tramite.Dominio = 'aa190po';
    //vm.Tramite.Chasis = 'J151496';
    //END-TEST

    vm.vehiculo = null;
    vm.MostrarResultado = false;

    vm.verificar = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                var params = {
                    dominio: vm.Tramite.Dominio,
                    chasis: window.btoa(vm.Tramite.Chasis),
                    numeroCPD: vm.Tramite.NroCPD,
                    conPrenda: vm.Tramite.ConPenda,
                    RecaptchaResponse: token
                };

                home.verificar(params, function (data) {
                    grecaptcha.reset();

                    vm.Tramite.Marca = data.Marca;
                    vm.Tramite.Modelo = data.Modelo;
                    vm.Tramite.Tipo = data.Tipo;
                    vm.Tramite.Anio = data.Anio;
                    vm.Tramite.Procedencia = data.Procedencia;
                    vm.Tramite.CodigoRegistro = data.CodigoRs;
                    vm.Tramite.Vehiculo = (data.CodigoRs < 25000 ? 'A' : data.CodigoRs > 50000 ? 'Q' : 'M');
                    vm.Tramite.Prenda = data.prenda;

                    vm.Tramite.NombreRegistro = data.NombreRegistro;
                    vm.Tramite.DireccionRegistro = data.DireccionRegistro;
                    vm.Tramite.CodigoProvincia = data.CodigoProvincia;
                    vm.Tramite.NombreProvincia = data.NombreProvincia;

                    if (data.Procedencia === 'I')
                        vm.Tramite.CodigoTramite = '084000';
                    else
                        vm.Tramite.CodigoTramite = '083000';

                    vm.MostrarResultado = true;
                },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    }

    registerInterceptorValidationSummary($scope, vm, $window);
}