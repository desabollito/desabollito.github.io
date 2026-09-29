angular
    .module('webApp')
    .controller('seleccionarRegistro08Controller', ['$scope', '$location', '$window', '$uibModal', 'session', 'Registro', 'SITE', seleccionarRegistro08Controller]);

function seleccionarRegistro08Controller($scope, $location, $window, $uibModal, session, Registro, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, null);

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.provincias = provincias;
        vm.solicitud.vehiculo = vm.solicitud.Vehiculo;
        vm.solicitud.registro = null;

        vm.vehiculo = vm.solicitud.Vehiculo;
        vm.codigoProvinciaVend = vm.solicitud.CodigoProvincia;
        vm.registroDireccionVend = vm.solicitud.DireccionRegistro;
        vm.registroLocalidadVend = vm.solicitud.Localidad;
        vm.registroTelefonoVend = vm.solicitud.Telefono;
        vm.registroHorarioVend = vm.solicitud.Horario;
        vm.codigoRegistroSeccionalVend = vm.solicitud.CodigoRegistro;
        vm.NombreProvincia = vm.solicitud.NombreProvincia;
        vm.NombreRegistro = vm.solicitud.NombreRegistro;

        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistro(
                {
                    CodigoRegistro: vm.codigoRegistroSeccionalVend,
                    RecaptchaResponse: token
                },
                function (data) {
                    grecaptcha.reset();
                    //vm.registro = new Registro();
                    vm.codigoRegistroSeccionalVend = data.CodigoRegistroSeccional;
                    vm.registroDenominacionVend = data.Denominacion;
                    vm.registroDireccionVend = data.Direccion;
                    vm.registroLocalidadVend = data.Localidad;
                    vm.registroTelefonoVend = data.Telefono;
                    vm.registroHorarioVend = data.Horario;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    }

    vm.sigueVendedor = function () {
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
            else {
                $location.path("/titulares");
            }
        }, function () {
        });
    }

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.solicitud.codigoVehiculo = vm.vehiculo;
            //vm.solicitud.registro = angular.copy(vm.registro);
            //vm.solicitud.registro = new Registro();

            vm.solicitud.codigoRegistroSeccional = vm.codigoRegistroSeccional;
            vm.solicitud.registroDenominacion = vm.registroDenominacion;
            vm.solicitud.registroDireccion = vm.registroDireccion;
            vm.solicitud.registroLocalidad = vm.registroLocalidad;
            vm.solicitud.registroTelefono = vm.registroTelefono;
            vm.solicitud.registroHorario = vm.registroHorario;

            modalInstance = $uibModal.open({
                animation: true,
                templateUrl: 'app/modules/vendedores/pregunta.html',
                controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {

                    $scope.Titulo = "Formulario 04";
                    $scope.Pregunta = "¿Ud posee un Formulario 04 con firma certificada?";

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
                var tramite = session.get(0);
                tramite.CodigoRegistroDestino = vm.codigoRegistroSeccional;

                if (tramite.CodigoRegistro !== tramite.CodigoRegistroDestino
                    && tramite.CodigoRegistroDestino !== 0) {
                    if (tramite.CodigoTramite === '084000')
                        tramite.CodigoTramite = '084001';
                    else
                        tramite.CodigoTramite = '083001';
                }

                session.set(0, tramite);

                if (rta) {
                    $location.path('/certificado04');
                }
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
        }
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb || vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/solicitante');
            return;
        }
        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
    };

    $scope.$watch('seleccionarRegistro08Ctrl.vehiculo', function (newVal, oldVal) {
        if (vm.vehiculo && vm.codigoProvincia) {
            vm.codigoRegistroSeccional = null;
            recaptchaCallback = function (token) {
                vm.formErrors = [];
                Registro.obtenerRegistrosPorProvincia(
                    {
                        CodigoProvincia: vm.codigoProvincia,
                        Vehiculo: vm.vehiculo,
                        RecaptchaResponse: token
                    },
                    function (data) {
                        grecaptcha.reset();
                        vm.registros = data;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    });

    vm.codigoProvinciaChanged = function ($item, $model) {
        vm.codigoRegistroSeccional = null;
        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistrosPorProvincia(
                {
                    CodigoProvincia: vm.codigoProvincia,
                    Vehiculo: vm.vehiculo,
                    RecaptchaResponse: token
                },
                function (data) {
                    grecaptcha.reset();
                    vm.registros = data;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.codigoRegistroChanged = function ($item, $model) {
        vm.codigoRegistroSeccional = $item.Key;
        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistro(
                {
                    CodigoRegistro: vm.codigoRegistroSeccional,
                    RecaptchaResponse: token
                },
                function (data) {
                    grecaptcha.reset();
                    //vm.registro = new Registro();
                    vm.codigoRegistroSeccional = data.CodigoRegistroSeccional;
                    vm.registroDenominacion = data.Denominacion;
                    vm.registroDireccion = data.Direccion;
                    vm.registroLocalidad = data.Localidad;
                    vm.registroTelefono = data.Telefono;
                    vm.registroHorario = data.Horario;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}