

angular
    .module('webApp')
    .controller('pagoController', ['$scope', '$location', '$window', '$filter', 'popupService', 'session', 'SITE', 'appConfig', pagoController]);


function pagoController($scope, $location, $window, $filter, popupService, session, SITE, appConfig) {
    $window.scrollTo(0, 0);
    var vm = this;

    var subtitulo = 'Podés pagar el total de la solicitud de manera electrónica o personalmente en el registro correspondiente.';
    vm.epagosHabilitado = false;

    // Nueva propiedad para controlar si solo se muestra VEP
    vm.soloMostrarVEP = false;

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.presupuesto = vm.solicitud.presupuesto;

        // Verificar si el registro seccional es 02993 Y la operación es InformeWeb
        if (vm.solicitud.codigoRegistroSeccional === 2993 &&
            vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            vm.soloMostrarVEP = true;
            // Forzar VEP como habilitado para este registro y operación
            vm.solicitud.registroVEPHabilitado = true;
            vm.solicitud.registroPagoMisCuentasHabilitado = false;
            vm.solicitud.registroTurnoPagoHabilitado = false;
            // Cambiar el subtítulo para este caso específico
            subtitulo = 'Para informes en este registro seccional, podés pagar únicamente mediante VEP (Volante Electrónico de Pago).';
        }

        SITE.epagosHabilitado({ rs: vm.solicitud.codigoRegistroSeccional },
            function (response) {
                // Si es el registro 02993 con operación InformeWeb, no habilitar EPagos
                vm.epagosHabilitado = vm.soloMostrarVEP ? false : response.habilitado;
            });

        vm.solicitud.pago = null;
        vm.pago = new Pago();
        vm.pago.tipoDocumento = '1';

        // Si solo se muestra VEP, forzar pago en línea
        if (vm.soloMostrarVEP) {
            vm.pago.formaPago = '1';
        }

        if (vm.solicitud.operacion == OperacionEnum.TramiteDigital || vm.solicitud.operacion === 10) {
            var subtitulo = 'Podés pagar el total de la solicitud de manera electrónica.';
            vm.pago.formaPago = '1';
            vm.pago.numeroDocumento = parseInt(vm.solicitud.solicitante.asociacionCuit);
            vm.solicitud.registroTurnoPagoHabilitado = false;
        }
    }

    setSubtitulo($scope, subtitulo);

    // Modificar la lógica de mostrar EPagos
    vm.mostrarEPago = !vm.soloMostrarVEP && (vm.solicitud.codigoTramite !== "083001" &&
        vm.solicitud.codigoTramite !== "084001" &&
        vm.solicitud.codigoTramite !== "020500" &&
        vm.solicitud.codigoTramite !== "110000");

    console.log('Registro:', vm.solicitud.codigoRegistroSeccional,
        'Operación:', vm.solicitud.operacion,
        'Mostrar EPago:', vm.mostrarEPago,
        'Solo VEP:', vm.soloMostrarVEP);

    // Modificar la lógica del cartel
    vm.mostrarCartel = !vm.soloMostrarVEP && appConfig.solicitarTurno &&
        !vm.solicitud.registroVEPHabilitado &&
        !vm.solicitud.registroPagoMisCuentasHabilitado;

    vm.calcularTotalPresupuesto = function () {
        var total = 0;
        angular.forEach(vm.presupuesto.DetallePrecioPrecargaViewModel, function (value, key) {
            total += value.PrecioUnitario * value.Cantidad;
        });
        // ePagos calculo sin impuestos
        if (vm.mostrarEPago && vm.pago.formaPago === '3' && (
            vm.solicitud.codigoTramite.substring(0, 2) === '01' || vm.solicitud.codigoTramite.substring(0, 2) === '08')
        ) {
            const descuento = vm.presupuesto.DetallePrecioPrecargaViewModel[vm.presupuesto.DetallePrecioPrecargaViewModel.length - 1].PrecioUnitario * vm.presupuesto.DetallePrecioPrecargaViewModel[vm.presupuesto.DetallePrecioPrecargaViewModel.length - 1].Cantidad;
            total -= descuento;
        }
        return total;
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            $location.path('/seleccionarTramite');
            return;
        }

        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
        return;
    };

    vm.submit = function () {
        vm.formErrors = [];

        // Validación específica para registro 02993 con operación InformeWeb
        if (vm.soloMostrarVEP && vm.pago.formaPago !== '1') {
            vm.formErrors.push('Para informes en este registro seccional solo está disponible el pago mediante VEP.');
            $window.scrollTo(0, 0);
            return;
        }

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.pago.montoPresupuesto = vm.calcularTotalPresupuesto();
            vm.solicitud.pago = angular.copy(vm.pago);

            //ASOCIASIONES PROFESIONALES
            if (vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales || vm.solicitud.codigoTramite === '020606') {
                vm.pago.formaPago = '1';//PAGO EN LINEA
                vm.solicitud.pago.formaPago = '1';//PAGO EN LINEA

                if (vm.solicitud.codigoRegistroSeccional === null)
                    vm.solicitud.codigoRegistroSeccional = 2001;

                vm.handlerPago(true);
                return;
            }

            // Si es el caso especial (registro 02993 + InformeWeb), forzar finalización sin turno
            if (vm.soloMostrarVEP) {
                vm.handlerPago(true); // evitarTurno = true
                return;
            }

            // ... resto del código del submit permanece igual

            //SI ES MANDATARIO O CONCESIONARIO PREGUNTO SI QUIERE TOMAR TURNO, SI NO FINALIZO.
            if (vm.solicitud.operacion === OperacionEnum.Turno && (vm.solicitud.esMandatario || vm.solicitud.codigoTramite === '010999') && vm.solicitud.codigoTramite !== '570300' && vm.solicitud.codigoTramite !== '570302') {
                //HACK PARA MANDATARIO Y ENVIO POR EMAIL
                //110000	DENUNCIA DE VENTA
                //020500	CERTIFICADO DE DOMINIO
                if (vm.solicitud.esMandatario &&
                    vm.solicitud.mandatarioCertificaFirma === "1" &&
                    vm.solicitud.mandatarioRequiereF13I === "1" &&
                    (vm.solicitud.codigoTramite === '110000' || vm.solicitud.codigoTramite === '020500')) {
                    recaptchaCallback = function (token) {
                        SITE.validarPago(
                            {
                                RecaptchaResponse: token,
                                CodigoTramite: vm.solicitud.codigoTramite,
                                Dominio: vm.solicitud.dominio,
                                Precarga: vm.solicitud.armarObjetoParaPost().Precarga,
                                Pago: vm.solicitud.armarObjetoParaPost().Pago
                            },
                            function (data) {
                                grecaptcha.reset();
                                if (data.EsRecibirPorEmail) {
                                    vm.solicitud.operacion = OperacionEnum.InformeWeb;
                                    vm.handlerPago(false);
                                } else {
                                    //SI NO ES ENVIO POR EMAIL, REPITO FLUJO NORMAL
                                    vm.showConfirmTurno();
                                }
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                }
                //END:HACK PARA MANDATARIO Y ENVIO POR EMAIL
                else {
                    vm.showConfirmTurno();
                }
            } else {
                //VALIDAR PAGO PARA OBTENER TIPO DESPACHO
                //SI TIPO DESPACHO === 2001 => EVITAR TURNO
                //570300	INFORME NOMINAL NACIONAL
                if (vm.solicitud.codigoTramite === '030999' || vm.solicitud.codigoTramite === '110000' || vm.solicitud.codigoTramite === '020500' || vm.solicitud.codigoTramite === '570300' || vm.solicitud.codigoTramite === '570302') {
                    recaptchaCallback = function (token) {
                        SITE.validarPago(
                            {
                                RecaptchaResponse: token,
                                CodigoTramite: vm.solicitud.codigoTramite,
                                Dominio: vm.solicitud.dominio,
                                Precarga: vm.solicitud.armarObjetoParaPost().Precarga,
                                Pago: vm.solicitud.armarObjetoParaPost().Pago
                            },
                            function (data) {
                                grecaptcha.reset();
                                if (data.EsRecibirPorEmail) {
                                    vm.solicitud.operacion = OperacionEnum.InformeWeb;
                                }

                                vm.handlerPago(false || (vm.solicitud.operacion === OperacionEnum.TramiteDigital));
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                } else {
                    if (vm.solicitud.operacion == OperacionEnum.TramiteDigital) {
                        vm.handlerPago(true);
                    } else {
                        //NO ES MANDATARIO O NO ES TURNO
                        vm.handlerPago(false);
                    }
                }
            }
            return;
        }
    };

// ... resto de las funciones permanecen igual

    vm.showConfirmTurno = function () {
        popupService.showConfirm('Cada Mandatario puede obtener sólo un turno por día  y en él presentar varias precargas. Presioná ACEPTAR en caso de necesitar obtenerlo o CANCELAR para volver al menú y continuar la generación de precargas.', 'Turno Mandatarios')
            .then(
                function () {
                    vm.handlerPago(false);
                },
                function () {
                    vm.handlerPago(true);
                });
    };

    vm.handlerPago = function (evitarTurno) {
        //ESTOY EN REGISTRO, ENTONCES SALTEO EL TURNO
        if (!appConfig.solicitarTurno) {
            evitarTurno = true;
        }

        //PAGO EN EL REGISTRO
        if (vm.pago.formaPago === '2') {
            //MANDATARIO EVITAR TURNO
            if (evitarTurno) {
                vm.finalizar();
                return;
            }
            vm.seleccionarTurno();
            return;
        }

        //PAGO EPAGOS
        if (vm.pago.formaPago === '3') {

            vm.solicitud.pago.formaPago = 1;
            vm.solicitud.pago.medioPago = 1006;
            vm.solicitud.pago.medioPagoNombre = 'E-Pagos';
            
            //CONTINUAR - INFORME WEB
            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                evitarTurno = true;
            }

            //EVITAR TURNO
            if (evitarTurno) {
                //SE FINALIZA VALIDANDO EMAIL
                if (!vm.solicitud.emailValido) {
                    $location.path('/enviarEmail');
                    return;
                }
                //SI EMAIL ES VALIDO SE FINALIZA
                else {
                    vm.finalizar();
                    return;
                }
            }

            //CONTINUAR - SOLICITAR TURNO
            if (vm.solicitud.operacion === OperacionEnum.Turno) {
                vm.seleccionarTurno();
            }
            return;
        }

        //PAGO EN LINEA
        if (vm.pago.formaPago === '1') {

            vm.solicitud.pago.medioPago = vm.solicitud.registroVEPHabilitado ? 1004 : 1000;
            vm.solicitud.pago.medioPagoNombre = vm.solicitud.registroVEPHabilitado ? 'Volante electrónico de pago (VEP)' : 'Pago Mis Cuentas';
            if (vm.pago.codigoBanco) {
                vm.solicitud.pago.nombreBanco = $filter('filter')(vm.solicitud.bancos, { Key: vm.pago.codigoBanco })[0].Value;
            }
            if (vm.pago.codigoRed) {
                vm.solicitud.pago.nombreRed = $filter('filter')(vm.solicitud.redes, { Key: vm.pago.codigoRed })[0].Value;
            }

            //SI ES ERROR DE PAGO REINTENTO
            if (vm.solicitud.ErrorPago) {
                vm.finalizar();
                return;
            }

            //CONTINUAR - INFORME WEB
            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                evitarTurno = true;
            }

            //EVITAR TURNO
            if (evitarTurno) {
                //SE FINALIZA VALIDANDO EMAIL
                if (!vm.solicitud.emailValido) {
                    $location.path('/enviarEmail');
                    return;
                }
                //SI EMAIL ES VALIDO SE FINALIZA
                else {
                    vm.finalizar();
                    return;
                }
            }

            //CONTINUAR - SOLICITAR TURNO
            if (vm.solicitud.operacion === OperacionEnum.Turno) {
                vm.seleccionarTurno();
            }

        }
    };

    vm.seleccionarTurno = function () {
        recaptchaCallback = function (token) {
            SITE.obtenerTurnos(
                {
                    CodigoRegistroSeccional: vm.solicitud.codigoRegistroSeccional,
                    CodigoTramite: vm.solicitud.codigoTramite,
                    Vehiculo: vm.solicitud.codigoVehiculo,
                    EsTurnoParaRetirarDocumentacion: vm.pago.formaPago === '1',//PAGO EN LINEA
                    RecaptchaResponse: token,
                    EsMandatario: vm.solicitud.esMandatario,
                    Cuit: vm.solicitud.esMandatario ? vm.solicitud.mandatarioCuit : vm.solicitud.solicitante.numeroDocumento
                },
                function (data) {
                    grecaptcha.reset();
                    vm.solicitud.turnoToday = data.hoy;
                    vm.solicitud.turnoStart = data.inicio;
                    vm.solicitud.turnoEnd = data.fin;
                    vm.solicitud.turnoDiasnolaborables = data.diasNoLaborables;
                    vm.solicitud.dias = data.dias;
                    $location.path('/seleccionarTurno');
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.finalizar = function () {
        recaptchaCallback = function (token) {
            SITE.finalizar({ Solicitud: vm.solicitud.armarObjetoParaPost(), RecaptchaResponse: token },
                function (data) {
                    grecaptcha.reset();
                    vm.solicitud.ErrorTurno = false;
                    vm.solicitud.ErrorPago = false;

                    if (data.ErrorTurno) {
                        vm.solicitud.ErrorTurno = data.ErrorTurno;
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
                        $window.scrollTo(0, 0);
                        $location.path('/pago');
                        return;
                    } else {
                        $location.path('/finalizar');
                    }
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}