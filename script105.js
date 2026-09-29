angular
    .module('webApp')
    .controller('turnoController', ['$scope', '$location', '$filter', '$window', '$uibModal', 'session', 'SITE', 'turno', turnoController]);

function turnoController($scope, $location, $filter, $window, $uibModal, session, SITE, turno) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Seleccioná el día y la hora para ir al Registro.');

    vm.solicitud = session.get(0);
    
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.solicitud.fecha = null;
        vm.solicitud.hora = null;
    }

    try {
        if (vm.solicitud.esMandatario) {
            turno.obtenerTurnosEstadistica({ cuitSolicita: vm.solicitud.mandatarioCuit },
                function (data) {
                    vm.TurnosOcupados = data.TurnosOcupados;
                    vm.TurnosCancelados = data.TurnosCancelados;
                    vm.TurnosDesistidos = data.TurnosDesistidos;
                    vm.TurnosAusentes = data.TurnosAusentes;
                    vm.TurnosAtendidos = data.TurnosAtendidos;
                    vm.TurnosMandatario = data.TurnosMandatario;
                    vm.TurnosParticular = data.TurnosParticular;

                    vm.mostrarDataTurnos = true;
                },
                function () {
                    vm.mostrarDataTurnos = false;
                });
        } else {
           turno.obtenerTurnosEstadistica({ cuitSolicita: vm.solicitud.solicitante.numeroDocumento },
                function (data) {
                    vm.TurnosOcupados = data.TurnosOcupados;
                    vm.TurnosCancelados = data.TurnosCancelados;
                    vm.TurnosDesistidos = data.TurnosDesistidos;
                    vm.TurnosAusentes = data.TurnosAusentes;
                    vm.TurnosAtendidos = data.TurnosAtendidos;
                    vm.TurnosMandatario = data.TurnosMandatario;
                    vm.TurnosParticular = data.TurnosParticular;

                    vm.mostrarDataTurnos = true;
                },
                function () {
                    vm.mostrarDataTurnos = false;
                });
        }
    }
    catch (e) {
        vm.mostrarDataTurnos = false;
    }


    vm.today = vm.solicitud.turnoToday;
    vm.start = vm.solicitud.turnoStart;
    vm.end = vm.solicitud.turnoEnd;
    vm.diasnolaborables = vm.solicitud.turnoDiasnolaborables;

    vm.onSelectDay = function (dia) {
        $scope.$apply(
            function () {
                vm.fecha = dia;
                vm.hora = null;
                vm.horarios = $filter('filter')(vm.solicitud.dias, { FechaString: dia })[0].Horarios;
            }
        );
    };

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //vm.solicitud.turno = angular.copy(vm.turno);
            vm.solicitud.fecha = vm.fecha;
            vm.solicitud.hora = vm.hora;
            if (vm.solicitud.mandatarioApellido === "undefined" && vm.solicitud.apellidoMandatario !== "undefined") {
                vm.solicitud.mandatarioApellido = vm.solicitud.apellidoMandatario;
            }
            if (vm.solicitud.mandatarioCuit === "undefined" && vm.solicitud.cuitMandatario !== "undefined") {
                vm.solicitud.mandatarioCuit = vm.solicitud.cuitMandatario;
            }
            if (vm.solicitud.mandatarioNombre === "undefined" && vm.solicitud.mandatarioNombre !== "undefined") {
                vm.solicitud.mandatarioNombre = vm.solicitud.mandatarioNombre;
            }
            if (vm.solicitud.esMandatario === "undefined" && vm.solicitud.esMandatario !== "undefined") {
                vm.solicitud.esMandatario = vm.solicitud.esMandatario;
            }





            if (!vm.solicitud.emailValido) {
                $location.path('/enviarEmail');
            } else {
                recaptchaCallback = function (token) {
                    SITE.finalizar({ Solicitud: vm.solicitud.armarObjetoParaPost(), RecaptchaResponse: token },
                        function (data) {
                            grecaptcha.reset();
                            vm.solicitud.ErrorTurno = false;
                            vm.solicitud.ErrorPago = false;
                            vm.solicitud.ErrorTurnoSolDuplicado = false;

                            if (data.ErrorTurno) {
                                vm.solicitud.ErrorTurno = data.ErrorTurno;
                                vm.solicitud.ErrorMensaje = data.ErrorMensaje;
                                vm.fecha = null;
                                vm.hora = null;
                                vm.horarios = null;
                                vm.solicitud.fecha = null;
                                vm.solicitud.hora = null;
                                vm.solicitud.turnoToday = data.turnos.hoy;
                                vm.solicitud.turnoStart = data.turnos.inicio;
                                vm.solicitud.turnoEnd = data.turnos.fin;
                                vm.solicitud.turnoDiasnolaborables = data.turnos.diasNoLaborables;
                                vm.solicitud.dias = data.turnos.dias;
                                $window.scrollTo(0, 0);
                                $location.path('/seleccionarTurno');
                                return;
                            }
                            if (data.ErrorTurnoSolDuplicado) {
                                vm.solicitud.ErrorTurnoSolDuplicado = data.ErrorTurnoSolDuplicado;
                                vm.fecha = null;
                                vm.hora = null;
                                vm.horarios = null;
                                vm.solicitud.fecha = null;
                                vm.solicitud.hora = null;
                                vm.solicitud.turnoToday = data.turnos.hoy;
                                vm.solicitud.turnoStart = data.turnos.inicio;
                                vm.solicitud.turnoEnd = data.turnos.fin;
                                vm.solicitud.turnoDiasnolaborables = data.turnos.diasNoLaborables;
                                vm.solicitud.dias = data.turnos.dias;
                                $window.scrollTo(0, 0);
                                $location.path('/seleccionarTurno');
                                return;
                            }


                            vm.solicitud.ErrorPago = data.ErrorPago;
                            vm.solicitud.numeroVEP = data.numeroVEP;
                            vm.solicitud.numeroPagoMisCuentas = data.numeroPagoMisCuentas;
                            vm.solicitud.numeroPrecarga = data.NumeroPrecarga;
                            vm.solicitud.codigoParaServicios = data.CodigoParaServicios;
                            vm.solicitud.horasValidez = data.HorasValidez;

                            if (data.ErrorPago) {
                                $location.path('/pago');
                                return;
                            } else {
                                if (vm.solicitud.esMandatario && !(vm.solicitud.codigoTramite === "999998" || vm.solicitud.codigoTramite === "010000" || vm.solicitud.codigoTramite === "010103" || vm.solicitud.codigoTramite === "010105" || vm.solicitud.codigoTramite === "010205" || vm.solicitud.codigoTramite === "010998"))
                                {
                                    modalInstance = $uibModal.open({
                                        animation: true,
                                        templateUrl: 'app/modules/mandatario/impresion.html',
                                        controller: ['$scope', '$uibModalInstance', 'Formulario08D', function ($scope, $uibModalInstance, Formulario08D) {
                                            Formulario08D.recuperar({ nroPrecarga: data.NumeroPrecarga, cuit: vm.solicitud.mandatarioCuit }, function (data1) {
                                                $scope.form = data1;
                                            },
                                                function (error) {
                                                    $scope.formErrors = [];
                                                    if (error.data.ModelState) {
                                                        if (error.data.ModelState.captchaText) {
                                                            $scope.formErrors.push(error.data.ModelState.captchaText[0]);
                                                        }
                                                    }
                                                    else {
                                                        $scope.formErrors.push(error.data.ExceptionMessage);
                                                    }
                                                });

                                            $scope.imprimirForm = function (key) {

                                                var leftPosition = (screen.width) ? (screen.width - 1250) / 2 : 0;
                                                var topPosition = (screen.height) ? (screen.height - 1250) / 2 : 0;

                                                var settings = "toolbar=no,scrollbars=yes,location=no,statusbar=no,menubar=no,resizable=yes,width=1050px, height=900px,left=" + leftPosition + "px,innerLeft=" + leftPosition + "px,top=" + topPosition + "px,innerTop=" + topPosition + "px";
                                                var url = "app/modules/mandatario/impresionFormulario.html";

                                                popUp = window.open(url, "_blank", settings);
                                                popUp.DataToShare = $scope.form.Formularios[key];
                                                popUp.focus();
                                            };

                                            $scope.terminar = function () {
                                                $uibModalInstance.dismiss();
                                            };

                                            $scope.close = function () {
                                                $uibModalInstance.dismiss('cancel');
                                            };
                                        }],
                                        controllerAs: 'impresionCtrl',
                                        backdrop: 'static',
                                        resolve: {
                                        }
                                    });
                                    modalInstance.result.then(function (rta) {
                                        $location.path('/finalizar');
                                    }, function () {
                                        $location.path('/finalizar');
                                    });
                                }
                                else {
                                    $location.path('/finalizar');
                                }
                            }
                        },
                        function () {
                            grecaptcha.reset();
                        });
                };
                grecaptcha.execute();
            }
        }
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            if (vm.solicitud.vehiculo) {
                $location.path('/identificarDominio');//Identifico el vehiculo
            } else {
                $location.path('/seleccionarRegistro');//Selecciono el registro
            }
            return;
        }
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            $location.path('/pago');
            return;
        }
        if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
            $location.path('/solicitante');
            return;
        }
        $location.path('/');
    };
}